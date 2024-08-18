const workerConfig = {
  // 除非状态发生变化，否则每3分钟最多写入KV一次。
  kvWriteCooldownMinutes: 3,
  // 在此处定义所有的监控器
  monitors: [
    {
      // `id` 应该是唯一的，如果 `id` 保持不变，将保留历史记录
      id: "blog_monitor",
      // `name` 用于状态页面和回调消息
      name: "我的博客网站",
      // `method` 应该是一个有效的HTTP方法
      method: "HEAD",
      // `target` 是一个有效的URL
      target: "https://blog.huala.fun",
      // [可选] `tooltip` 仅用于在状态页面上显示工具提示
      tooltip: "https://blog.huala.fun",
      headers: {
        "User-Agent": "uptime_worker",
      },
      statusPageLink: "https://example.com",
    },
  ],
  callbacks: {
    onStatusChange: async (
      env: any,
      monitor: any,
      isUp: boolean,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 当任何监控器的状态发生变化时，将调用此回调
      // 在此处编写任何Typescript代码
      // 这将不遵循宽限期设置，并且将在状态变化时立即调用
      // 如果您想实现它，您需要手动处理宽限期
    },
    onIncident: async (
      env: any,
      monitor: any,
      timeIncidentStart: number,
      timeNow: number,
      reason: string
    ) => {
      // 如果任何监控器持续存在故障，此回调将每1分钟被调用一次
      // 在此处编写任何Typescript代码
    },
  },
  notification: {
    // [可选] apprise API服务器URL
    // 如果没有指定，将不会发送通知
    appriseApiServer: "",
    // [可选] apprise的接收者URL，请参阅 https://github.com/caronc/apprise
    // 如果没有指定，将不会发送通知
    recipientUrl: "",
    // [可选] 通知消息中使用时区，默认为 "Etc/GMT"
    timeZone: "Asia/Shanghai",
    // [可选] 在发送通知之前的宽限期（分钟）
    // 只有在监控器在初次失败后连续N次检查仍然处于故障状态时，才会发送通知
    // 如果没有指定，将立即发送通知
    gracePeriod: 5,
  }
};
export { workerConfig };
