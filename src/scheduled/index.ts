import { getWorkerLocation } from "@/lib/util";
import { workerConfig } from "../../worker.config";
import { getMonitorStatus } from "@/lib/monitor";

// [[triggers]] configuration.
export const scheduled = async (
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> => {
  // Get the current time.
  const workerLocation = (await getWorkerLocation()) || "ERROR";
  console.log(`Running scheduled event on ${workerLocation}...`);

  // 从 KV 中读取 state， 如果不存在设置默认值
  const state =
    ((await env.UPTIMEFLARE_STATE_V1.get("state", {
      type: "json",
    })) as unknown as MonitorState) ||
    ({
      version: 1,
      lastUpdate: 0,
      overallUp: 0,
      overallDown: 0,
      incident: {},
      latency: {},
    } as MonitorState);

  state.overallDown = 0;
  state.overallUp = 0;

  let statusChanged = false;
  const currentTimeSecond = Math.round(Date.now() / 1000);

  // 检查每一个监听器的状态
  for (const monitor of workerConfig.monitors) {
    console.log(`[${workerLocation}] Checking ${monitor.name}...`);
    let monitorStatusChanged = false;
    let checkLocation = workerLocation;
    // 获取当前监听器的状态
    const status = await getMonitorStatus(monitor);
    // const status = await getStatus(monitor)
    const currentTimeSecond = Math.round(Date.now() / 1000);
    // 更新存活和挂掉的次数
    status.up ? state.overallUp++ : state.overallDown++;

    // 使用 incident 存储每一个监控器的监控信息
    state.incident[monitor.id] = state.incident[monitor.id] || [
      {
        start: [currentTimeSecond],
        end: currentTimeSecond,
        error: ["dummy"],
      },
    ];
    // 获取监控器的最后一次监控信息
    const lastIncident = state.incident[monitor.id].slice(-1)[0];
    if (status.up) {
      // Current status is up
      // close existing incident if any
      if (lastIncident.end === undefined) {
        lastIncident.end = currentTimeSecond;
        monitorStatusChanged = true;
        try {
          if (
            // grace period not set OR ...
            workerConfig.notification?.gracePeriod === undefined ||
            // only when we have sent a notification for DOWN status, we will send a notification for UP status (within 30 seconds of possible drift)
            currentTimeSecond - lastIncident.start[0] >=
              (workerConfig.notification.gracePeriod + 1) * 60 - 30
          ) {
            // await formatAndNotify(
            //   monitor,
            //   true,
            //   lastIncident.start[0],
            //   currentTimeSecond,
            //   "OK"
            // );
          } else {
            console.log(
              `grace period (${workerConfig.notification?.gracePeriod}m) not met, skipping apprise UP notification for ${monitor.name}`
            );
          }

          console.log("Calling config onStatusChange callback...");
          await workerConfig.callbacks.onStatusChange(
            env,
            monitor,
            true,
            lastIncident.start[0],
            currentTimeSecond,
            "OK"
          );
        } catch (e) {
          console.log("Error calling callback: ");
          console.log(e);
        }
      }
    } else {
      // Current status is down
      // open new incident if not already open
      if (lastIncident.end !== undefined) {
        state.incident[monitor.id].push({
          start: [currentTimeSecond],
          end: undefined,
          error: [status.err],
        });
        monitorStatusChanged = true;
      } else if (
        lastIncident.end === undefined &&
        lastIncident.error.slice(-1)[0] !== status.err
      ) {
        // append if the error message changes
        lastIncident.start.push(currentTimeSecond);
        lastIncident.error.push(status.err);
        monitorStatusChanged = true;
      }
      const currentIncident = state.incident[monitor.id].slice(-1)[0];
      try {
        if (
          // monitor status changed AND...
          (monitorStatusChanged &&
            // grace period not set OR ...
            (workerConfig.notification?.gracePeriod === undefined ||
              // have sent a notification for DOWN status
              currentTimeSecond - currentIncident.start[0] >=
                (workerConfig.notification.gracePeriod + 1) * 60 - 30)) ||
          // grace period is set AND...
          (workerConfig.notification?.gracePeriod !== undefined &&
            // grace period is met
            currentTimeSecond - currentIncident.start[0] >=
              workerConfig.notification.gracePeriod * 60 - 30 &&
            currentTimeSecond - currentIncident.start[0] <
              workerConfig.notification.gracePeriod * 60 + 30)
        ) {
          //   await formatAndNotify(
          //     monitor,
          //     false,
          //     currentIncident.start[0],
          //     currentTimeSecond,
          //     status.err
          //   );
        } else {
          console.log(
            `Grace period (${
              workerConfig.notification?.gracePeriod
            }m) not met (currently down for ${
              currentTimeSecond - currentIncident.start[0]
            }s, changed ${monitorStatusChanged}), skipping apprise DOWN notification for ${
              monitor.name
            }`
          );
        }

        if (monitorStatusChanged) {
          console.log("Calling config onStatusChange callback...");
          await workerConfig.callbacks.onStatusChange(
            env,
            monitor,
            false,
            currentIncident.start[0],
            currentTimeSecond,
            status.err
          );
        }
      } catch (e) {
        console.log("Error calling callback: ");
        console.log(e);
      }

      try {
        console.log("Calling config onIncident callback...");
        await workerConfig.callbacks.onIncident(
          env,
          monitor,
          currentIncident.start[0],
          currentTimeSecond,
          status.err
        );
      } catch (e) {
        console.log("Error calling callback: ");
        console.log(e);
      }
    }
    // 记录每次的延迟数据
    const latencyLists = state.latency[monitor.id] || {
      recent: [],
      all: [],
    };
    const record = {
      loc: checkLocation,
      ping: status.ping,
      time: currentTimeSecond,
    };
    latencyLists.recent.push(record);
    if (
      latencyLists.all.length === 0 ||
      currentTimeSecond - latencyLists.all.slice(-1)[0].time > 60 * 60
    ) {
      latencyLists.all.push(record);
    }
    // 保留 12 小时数据
    while (latencyLists.recent[0]?.time < currentTimeSecond - 12 * 60 * 60) {
      latencyLists.recent.shift();
    }
    // 保留 90 天数据
    while (latencyLists.all[0]?.time < currentTimeSecond - 90 * 24 * 60 * 60) {
      latencyLists.all.shift();
    }
    state.latency[monitor.id] = latencyLists;
    // 只保留 90 天监控信息
    const incidentList = state.incident[monitor.id];
    while (
      incidentList.length > 0 &&
      incidentList[0].end &&
      incidentList[0].end < currentTimeSecond - 90 * 24 * 60 * 60
    ) {
      incidentList.shift();
    }
    // 确保有一个 dummy incident，防止上面 state.incident[monitor.id].slice(-1)[0] 报错
    if (
      incidentList.length == 0 ||
      (incidentList[0].start[0] > currentTimeSecond - 90 * 24 * 60 * 60 &&
        incidentList[0].error[0] != "dummy")
    ) {
      // put the dummy incident back
      incidentList.unshift({
        start: [currentTimeSecond - 90 * 24 * 60 * 60],
        end: currentTimeSecond - 90 * 24 * 60 * 60,
        error: ["dummy"],
      });
    }
    state.incident[monitor.id] = incidentList;
    // 确保有一个 monitor 状态改变就更新状态
    statusChanged ||= monitorStatusChanged;
  }
  console.log(
    `statusChanged: ${statusChanged}, lastUpdate: ${state.lastUpdate}, currentTime: ${currentTimeSecond}`
  );
  // 除非状态发生变化，否则每3分钟最多写入KV一次。
  if (
    statusChanged ||
    currentTimeSecond - state.lastUpdate >=
      workerConfig.kvWriteCooldownMinutes * 60 - 10
    // 10 秒误差
  ) {
    console.log("Updating state...");
    state.lastUpdate = currentTimeSecond;
    await env.UPTIMEFLARE_STATE_V1.put("state", JSON.stringify(state));
  } else {
    console.log("Skipping state update due to cooldown period.");
  }
};
