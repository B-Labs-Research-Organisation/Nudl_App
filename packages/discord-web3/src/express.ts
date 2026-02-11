export interface Config {
  secret?: string;
  hideStack?: boolean;
}

export class ExtendedError extends Error {
  status?: number;
}

export function isExtendedError(error: unknown): error is ExtendedError {
  return Boolean(error && typeof error === "object" && "status" in error);
}

export interface Request {
  ip?: string;
  method?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  token?: unknown;
}

export interface Response {
  send(body: unknown): Response;
  json(body: unknown): Response;
  status(code: number): Response;
}

export type NextFunction = (error?: unknown) => void;

export type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

export interface Router {
  post(path: string, handler: Handler): void;
  get(path: string, handler: Handler): void;
  use(...args: unknown[]): void;
}

export interface Application {
  set(setting: string, value: unknown): void;
  use(...args: unknown[]): void;
  options(path: string, ...handlers: unknown[]): void;
  get(path: string, handler: Handler): void;
  listen(port: number | string, ...args: unknown[]): void;
}

class NoopRouter implements Router {
  post(_path: string, _handler: Handler): void {}

  get(_path: string, _handler: Handler): void {}

  use(..._args: unknown[]): void {}
}

class NoopApplication extends NoopRouter implements Application {
  set(_setting: string, _value: unknown): void {}

  options(_path: string, ..._handlers: unknown[]): void {}

  listen(_port: number | string, ..._args: unknown[]): void {}
}

export function createRouter(): Router {
  return new NoopRouter();
}

function createApplication(): Application {
  return new NoopApplication();
}

interface RouterConfig {
  router: Router;
  path: string;
}

type RouterConfigs = RouterConfig[];

export function Service(
  config: Config = {},
  routerConfigs: RouterConfigs,
): Application {
  const { hideStack = false } = config;

  const app = createApplication();

  app.set("trust proxy", true);

  routerConfigs.forEach(({ router, path }) => {
    app.use(path, router);
  });

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    const error = new ExtendedError("Not Found");
    error.status = 404;
    next(error);
  });

  app.use((
    err: ExtendedError | Error,
    req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
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
  });

  return app;
}
