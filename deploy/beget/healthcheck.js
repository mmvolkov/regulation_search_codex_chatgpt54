const http = require("node:http");

const request = http.get("http://127.0.0.1:5678/healthz", (response) => {
  if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400) {
    process.exit(0);
  }
  process.exit(1);
});

request.on("error", () => process.exit(1));
request.setTimeout(3000, () => {
  request.destroy();
  process.exit(1);
});
