#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk");
const Retell = require("retell-sdk").default;

// ---------------------------------------------------------------------------
// Configuration – set via environment variables or .env
// ---------------------------------------------------------------------------
const RETELL_API_KEY = process.env.RETELL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const RETELL_VOICE_ID = process.env.RETELL_VOICE_ID || "11labs-Adrian";
const RETELL_MODEL = process.env.RETELL_MODEL || "gpt-4o";
const AGENT_NAME = process.env.AGENT_NAME; // optional override

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  console.log(`
Usage:  node pdf-to-retell.js <path-to-call-script.pdf>

Environment variables (required):
  RETELL_API_KEY      Your Retell AI API key
  ANTHROPIC_API_KEY   Your Anthropic API key

Environment variables (optional):
  RETELL_VOICE_ID     Voice to use (default: 11labs-Adrian)
  RETELL_MODEL        Model for conversation flow (default: gpt-4o)
  AGENT_NAME          Name for the created agent
`);
  process.exit(1);
}

async function extractTextFromPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  return result.text;
}

// ---------------------------------------------------------------------------
// Claude: convert raw script text → conversation flow JSON
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at converting call scripts into Retell AI conversation flow definitions.

Given the raw text of a call script, produce a JSON object with the following structure:

{
  "agent_name": "<short descriptive name for this agent>",
  "global_prompt": "<any overarching instructions that apply to every node, e.g. tone, persona, compliance rules>",
  "nodes": [
    {
      "id": "<unique_snake_case_id>",
      "type": "conversation",
      "instruction": {
        "type": "prompt",
        "text": "<what the agent should do / say at this step>"
      },
      "edges": [
        {
          "id": "<unique_edge_id>",
          "destination_node_id": "<target node id>",
          "transition_condition": {
            "type": "prompt",
            "prompt": "<natural-language condition for when to follow this edge>"
          }
        }
      ]
    }
  ],
  "start_node_id": "<id of the first node>"
}

Rules:
1. Every script section / step becomes a "conversation" node.
2. The final node in each path should be an "end" node (type: "end", no instruction needed, edges: []).
3. Give each node and edge a unique, descriptive id.
4. Use prompt-based transition conditions that describe what the caller says or does.
5. If the script has branching paths (e.g. "if the customer says X, go to step Y"), model them as separate edges.
6. If the script has objection-handling sections, model them as separate nodes with edges back into the main flow.
7. Include a clear global_prompt that captures the agent's persona, tone, and any compliance/disclaimers from the script.
8. Return ONLY valid JSON — no markdown fences, no commentary.`;

async function convertScriptToFlow(scriptText) {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Here is a call script extracted from a PDF. Convert it into a Retell AI conversation flow JSON.\n\n--- CALL SCRIPT ---\n${scriptText}\n--- END CALL SCRIPT ---`,
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const raw = message.content[0].text.trim();

  try {
    return JSON.parse(raw);
  } catch {
    // Sometimes the model wraps in ```json ... ``` — strip it
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(cleaned);
  }
}

// ---------------------------------------------------------------------------
// Retell: create the conversation flow + agent
// ---------------------------------------------------------------------------

async function createRetellAgent(flowDef) {
  const client = new Retell({ apiKey: RETELL_API_KEY });

  // Prepare nodes — ensure end nodes have no instruction
  const nodes = flowDef.nodes.map((node) => {
    if (node.type === "end") {
      return { id: node.id, type: "end" };
    }
    return {
      id: node.id,
      type: node.type,
      instruction: node.instruction,
      edges: (node.edges || []).map((e) => ({
        id: e.id,
        destination_node_id: e.destination_node_id,
        transition_condition: e.transition_condition,
      })),
    };
  });

  console.log("\nCreating conversation flow...");
  const flow = await client.conversationFlow.create({
    start_speaker: "agent",
    start_node_id: flowDef.start_node_id || nodes[0]?.id,
    model_choice: { type: "cascading", model: RETELL_MODEL },
    global_prompt: flowDef.global_prompt || "",
    nodes,
  });

  console.log(`  Flow created: ${flow.conversation_flow_id}`);
  console.log(`  Nodes: ${nodes.length}`);

  console.log("\nCreating agent...");
  const agentName =
    AGENT_NAME || flowDef.agent_name || "PDF Script Agent";

  const agent = await client.agent.create({
    agent_name: agentName,
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: flow.conversation_flow_id,
      version: 0,
    },
    voice_id: RETELL_VOICE_ID,
  });

  console.log(`  Agent created: ${agent.agent_id}`);
  console.log(`  Agent name: ${agentName}`);

  return { flow, agent };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pdfPath = process.argv[2];

  if (!pdfPath) usage();
  if (!RETELL_API_KEY) {
    console.error("Error: RETELL_API_KEY environment variable is required.");
    process.exit(1);
  }
  if (!ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    process.exit(1);
  }

  const resolved = path.resolve(pdfPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: File not found: ${resolved}`);
    process.exit(1);
  }

  // Step 1: Extract text from PDF
  console.log(`\nExtracting text from: ${resolved}`);
  const scriptText = await extractTextFromPdf(resolved);

  if (!scriptText.trim()) {
    console.error("Error: No text could be extracted from the PDF.");
    process.exit(1);
  }
  console.log(`  Extracted ${scriptText.length} characters.`);

  // Step 2: Convert to conversation flow using Claude
  console.log("\nAnalyzing call script with Claude...");
  const flowDef = await convertScriptToFlow(scriptText);

  // Save intermediate JSON for inspection
  const outPath = resolved.replace(/\.pdf$/i, "_flow.json");
  fs.writeFileSync(outPath, JSON.stringify(flowDef, null, 2));
  console.log(`  Flow definition saved to: ${outPath}`);
  console.log(`  Nodes: ${flowDef.nodes.length}`);

  // Step 3: Create in Retell
  const { flow, agent } = await createRetellAgent(flowDef);

  console.log("\n--- Done! ---");
  console.log(`Conversation Flow ID : ${flow.conversation_flow_id}`);
  console.log(`Agent ID             : ${agent.agent_id}`);
  console.log(`Flow JSON            : ${outPath}`);
  console.log(
    `Dashboard            : https://beta.retellai.com/dashboard/conversation-flow/${flow.conversation_flow_id}`
  );
}

main().catch((err) => {
  console.error("\nFatal error:", err.message || err);
  process.exit(1);
});
