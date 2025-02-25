import { Request, Response, NextFunction, Router } from "express";
import {getId, RpcFunction} from './utils'

export function Service(rpc: RpcFunction): Router {
  const router = Router();
  router.post(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const id = getId();
      const request = {
        id,
        ip: req.ip,
        token: req.token,
        method: req.params["action"],
        params: req.body,
      };
      try {
        // logger.debug({ id, request }, `Rpc Request ${id}`);
        const result = await rpc(request);
        // logger.debug({ id, result }, `Rpc Result ${id}`);
        res.json(result);
      } catch (err) {
        // logger.error({ id, err }, `Rpc Error ${id}`);
        next(err);
      }
    }
  );

  router.get(
    "/:action",
    async (req: Request, res: Response, next: NextFunction) => {
      const id = getId();
      const request = {
        id,
        ip: req.ip,
        token: req.token,
        method: req.params["action"],
        params: req.query,
      };
      try {
        // logger.debug({ id, request }, `Rpc Request ${id}`);
        const result = await rpc(request);
        // logger.debug({ id, result }, `Rpc Result ${id}`);
        res.json(result);
      } catch (err) {
        // logger.error({ id, err }, `Rpc Error ${id}`);
        next(err);
      }
    }
  );
 return router;
}

export type Service = ReturnType<typeof Service>;
