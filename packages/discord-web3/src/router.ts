import {
  createRouter,
  type Request,
  type Response,
  type NextFunction,
  type Router,
} from "./express";
import { getId, RpcFunction, RpcParams } from "./utils";

function normalizeToken(token: unknown): string | undefined {
  if (typeof token === "string") {
    return token;
  }
  if (Array.isArray(token)) {
    return token[0];
  }
  return undefined;
}

function buildRpcRequest(
  req: Request,
  params: unknown,
  id: string,
): RpcParams {
  const methodSource = req.params?.action;
  const methodCandidate = Array.isArray(methodSource)
    ? methodSource[0]
    : methodSource;
  const method = methodCandidate ?? "";
  const token = (req as Record<string, unknown>).token;
  return {
    id,
    ip: req.ip,
    token: normalizeToken(token),
    method,
    params,
  };
}

export function Service(rpc: RpcFunction): Router {
  const router = createRouter();
  router.post(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const id = getId();
      const request = buildRpcRequest(req, req.body, id);
      try {
        const result = await rpc(request);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const id = getId();
      const request = buildRpcRequest(req, req.query, id);
      try {
        const result = await rpc(request);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );
  return router;
}

export type Service = ReturnType<typeof Service>;
