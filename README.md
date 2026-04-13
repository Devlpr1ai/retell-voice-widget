# PDF to Retell AI Conversation Flow

Converts a call script PDF into a Retell AI conversation flow agent. Uses Claude to intelligently parse the script into nodes, edges, and transition conditions, then creates the flow and agent via the Retell API.

## Setup

```bash
npm install
```

## Environment Variables

Create a `.env` file or export these:

```bash
# Required
export RETELL_API_KEY="your-retell-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"

# Optional
export RETELL_VOICE_ID="11labs-Adrian"   # Voice ID for the agent
export RETELL_MODEL="gpt-4o"            # Model for the conversation flow
export AGENT_NAME="My Sales Agent"       # Custom agent name
```

## Usage

```bash
node pdf-to-retell.js path/to/call-script.pdf
```

## What It Does

1. **Extracts text** from the PDF call script
2. **Analyzes the script** with Claude to identify conversation steps, branching logic, objection handling, and transitions
3. **Creates a conversation flow** in Retell AI with proper nodes and edges
4. **Creates an agent** linked to that flow with your chosen voice
5. **Saves the intermediate JSON** (`*_flow.json`) next to the PDF for inspection

## Output

The script prints the created Flow ID and Agent ID, plus a link to the Retell dashboard where you can review and edit the flow visually.

## How the Conversion Works

| Call Script Element        | Retell Flow Element              |
|----------------------------|----------------------------------|
| Script step / section      | `conversation` node              |
| Branching ("if customer...") | Multiple edges with conditions |
| Objection handling         | Separate nodes with return edges |
| Call ending / goodbye      | `end` node                       |
| Tone / persona / disclaimers | `global_prompt`                |
