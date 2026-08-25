import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMediaProxy } from "../server/mediaProxy";

export const config = {
  api: { bodyParser: false },
};

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleMediaProxy(req, res);
}
