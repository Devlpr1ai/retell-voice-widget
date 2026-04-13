const Retell = require("retell-sdk").default;

const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { agent_id } = JSON.parse(event.body);

    if (!agent_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "agent_id is required" }) };
    }

    const webCallResponse = await retellClient.call.createWebCall({ agent_id });

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: webCallResponse.access_token,
        call_id: webCallResponse.call_id,
      }),
    };
  } catch (err) {
    console.error("Failed to create web call:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create web call" }),
    };
  }
};
