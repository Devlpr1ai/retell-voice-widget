const express = require("express");
const cors = require("cors");
const path = require("path");
const Retell = require("retell-sdk").default;

const app = express();
app.use(cors());
app.use(express.json());

// Serve the widget files
app.use("/widget", express.static(path.join(__dirname, "widget")));

// Initialize Retell client
const retellClient = new Retell({
  apiKey: process.env.RETELL_API_KEY,
});

// Create a web call — returns an access token for the frontend
app.post("/api/create-web-call", async (req, res) => {
  const { agent_id } = req.body;

  if (!agent_id) {
    return res.status(400).json({ error: "agent_id is required" });
  }

  try {
    const webCallResponse = await retellClient.call.createWebCall({
      agent_id,
    });

    res.status(201).json({
      access_token: webCallResponse.access_token,
      call_id: webCallResponse.call_id,
    });
  } catch (err) {
    console.error("Failed to create web call:", err.message);
    res.status(500).json({ error: "Failed to create web call" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Web call server running on http://localhost:${PORT}`);
  console.log(`Widget available at http://localhost:${PORT}/widget/`);
});
