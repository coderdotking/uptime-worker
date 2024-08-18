import { Hono } from "hono";
import { workerConfig } from "../../worker.config";
import { getMonitorStatus } from "@/lib/monitor";

const app = new Hono<{
  Bindings: Bindings;
}>().basePath("/api");

app.get("/ping", (c) => {
  return c.text("worker is running...");
});

app.get("/monitor/list", async (c) => {
  const workerLocation = c.req.raw.cf?.colo;
  console.log(`Handling request event at ${workerLocation}...`);
  return c.json({
    location: workerLocation,
    list: workerConfig.monitors,
  });
});

app.get("/monitor/:monitorId", async (c) => {
  const monitorId = c.req.param("monitorId");
  const monitor = workerConfig.monitors.find((m) => m.id === monitorId);
  if (monitor === undefined) {
    return c.json({ msg: "Target Not Found", code: 404 });
  }
  const workerLocation = c.req.raw.cf?.colo;
  console.log(`Handling request event at ${workerLocation}...`);
  return c.json({
    location: workerLocation,
    monitor: monitor,
  });
});

app.get("/monitor/:monitorId/status", async (c) => {
  const monitorId = c.req.param("monitorId");
  const monitor = workerConfig.monitors.find((m) => m.id === monitorId);
  if (monitor === undefined) {
    return c.json({ msg: "Target Not Found", code: 404 });
  }
  const workerLocation = c.req.raw.cf?.colo;
  console.log(`Handling request event at ${workerLocation}...`);
  const status = await getMonitorStatus(monitor);
  return c.json({
    location: workerLocation,
    status: status,
  });
});

app.get("/state", async (c) => {
  const state = (await c.env.UPTIMEFLARE_STATE_V1.get("state", {
    type: "json",
  })) as unknown as MonitorState;
  const workerLocation = c.req.raw.cf?.colo;
  console.log(`Handling request event at ${workerLocation}...`);
  return c.json({
    location: workerLocation,
    state: state,
  });
});

export { app };
