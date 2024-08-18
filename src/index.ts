import { app } from "@/route";
import { scheduled } from "@/scheduled";
export default {
  fetch: app.fetch,
  scheduled,
};
