// Container healthcheck. `web`: HTTP /api/health. `worker`: heartbeat file written every loop.
const role = process.argv[2] || "web";
if (role === "worker") {
  const fs = require("fs");
  try {
    const t = Number(fs.readFileSync(process.env.WORKER_HEARTBEAT_FILE || "/tmp/worker-heartbeat", "utf8"));
    process.exit(Date.now() - t < 90_000 ? 0 : 1);
  } catch {
    process.exit(1);
  }
} else {
  fetch("http://127.0.0.1:3000/api/health")
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch(() => process.exit(1));
}
