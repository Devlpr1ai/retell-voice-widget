const Retell = require("retell-sdk").default;

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { agent_id } = JSON.parse(event.body);

    if (!agent_id) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "agent_id is required" }) };
    }

    const webCallResponse = await retellClient.call.createWebCall({ agent_id });

    return {
      statusCode: 201,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: webCallResponse.access_token,
        call_id: webCallResponse.call_id,
      }),
    };
  } catch (err) {
    console.error("Failed to create web call:", err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to create web call" }),
    };
  }
};
