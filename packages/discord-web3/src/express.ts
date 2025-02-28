import express, {
  Request,
  Response,
  NextFunction,
  Router,
  Express,
} from "express";
import cors from "cors";
import bodyParser from "body-parser";
import bearerToken from "express-bearer-token";
import cookieParser from "cookie-parser";

export type Config = {
  secret?: string;
  hideStack?: boolean;
};
export class ExtendedError extends Error {
  status?: number;
}
export function isExtendedError(error: any): error is ExtendedError {
  return error.status !== undefined;
}

type RouterConfig = {
  router: Router;
  path: string;
};
type RouterConfigs = RouterConfig[];

export function Service(
  config: Config = {},
  routerConfigs: RouterConfigs,
): Express {
  const { hideStack = false } = config;

  const app = express();

  // enable if behind proxy like cloudflare/ginx
  app.set("trust proxy", true);

  app.use(cors());
  app.use(bodyParser.json({ limit: "1mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));
  app.use(bearerToken());

  app.options("*", cors());

  app.get("/", (req: Request, res: Response) => {
    res.send(req.ip);
  });

  routerConfigs.forEach(({ router, path }) => {
    app.use(path, router);
  });

  app.use(function (req: Request, res: Response, next: NextFunction) {
    const error = new ExtendedError("Not Found");
    error["status"] = 404;
    next(error);
  });

  app.use(function (
    err: ExtendedError | Error,
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const request = {
      method: req.method,
      path: req.path,
      body: req.body,
    };
    let status = 500;
    if (isExtendedError(err)) {
      status = err.status ?? status;
    }
    res.status(status).json({
      message: err.message,
      request,
      stack: hideStack ? undefined : err.stack,
    });
    // logger.error({ request, err }, "Express Error");
  });

  return app;
}
