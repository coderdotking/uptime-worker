import { fetchTimeout } from "./util";

const getMonitorStatus = async (monitor: MonitorTarget): Promise<SiteState> => {
  const status: SiteState = {
    ping: 0,
    up: false,
    err: "Unknown",
  };
  const startTime = Date.now();
  // HTTP endpoint monitor
  try {
    const response = await fetchTimeout(
      monitor.target,
      monitor.timeout || 10000,
      {
        method: monitor.method,
        headers: monitor.headers as any,
        body: monitor.body,
        cf: {
          cacheTtlByStatus: {
            "100-599": -1, // Don't cache any status code, from https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
          },
        },
      }
    );

    console.log(`${monitor.name} responded with ${response.status}`);
    status.ping = Date.now() - startTime;

    if (monitor.expectedCodes) {
      if (!monitor.expectedCodes.includes(response.status)) {
        console.log(
          `${monitor.name} expected ${monitor.expectedCodes}, got ${response.status}`
        );
        status.up = false;
        status.err = `Expected codes: ${JSON.stringify(
          monitor.expectedCodes
        )}, Got: ${response.status}`;
        return status;
      }
    } else {
      if (response.status < 200 || response.status > 299) {
        console.log(`${monitor.name} expected 2xx, got ${response.status}`);
        status.up = false;
        status.err = `Expected codes: 2xx, Got: ${response.status}`;
        return status;
      }
    }

    if (monitor.responseKeyword) {
      const responseBody = await response.text();
      if (!responseBody.includes(monitor.responseKeyword)) {
        console.log(
          `${monitor.name} expected keyword ${
            monitor.responseKeyword
          }, not found in response (truncated to 100 chars): ${responseBody.slice(
            0,
            100
          )}`
        );
        status.up = false;
        status.err = "HTTP response doesn't contain the configured keyword";
        return status;
      }
    }

    status.up = true;
    status.err = "";
  } catch (e: any) {
    console.log(`${monitor.name} errored with ${e.name}: ${e.message}`);
    if (e.name === "AbortError") {
      status.ping = monitor.timeout || 10000;
      status.up = false;
      status.err = `Timeout after ${status.ping}ms`;
    } else {
      status.up = false;
      status.err = e.name + ": " + e.message;
    }
  }
  return status;
};

export { getMonitorStatus };
