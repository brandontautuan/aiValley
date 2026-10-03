// One-off helper: creates and starts a ZooWork agent owned by the API key in .env,
// so the key and agent are guaranteed to be in the same Project.
// Run once: node --env-file=.env scripts/create-zoowork-content-agent.mjs
import { createZooworkClient } from "@zoowork-ai/sdk";

const zc = createZooworkClient({ apiKey: process.env.ZOOWORK_API_KEY?.trim() });
const models = await zc.listModels();
const choice = models.find((m) => m.selectable !== false);
if (!choice) throw new Error("No selectable model returned by listModels()");

const agent = await zc.createAgent({ resource: { name: "aivalley-content", model: { primary: choice.model } } });
await zc.startAgent(agent.agent_id);
console.log(`Created and started agent using model ${choice.model}`);
console.log(`ZOOWORK_CONTENT_AGENT_ID=${agent.agent_id}`);
