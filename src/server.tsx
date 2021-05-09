import fastify from "fastify";
import { createServer as createViteServer, ViteDevServer } from "vite";
import fastifyExpress from "fastify-express";
import fs from "fs";
import path from "path";
import fastifyStatic from "fastify-static";
import { Request } from "node-fetch";
import type { ServerResponse } from "./entry-server";

function findDistRoot() {
  if (isProd) {
    const places = [path.join(__dirname, ".."), process.cwd()];

    const newPlace = places
      .map((place) => {
        return path.join(place, "dist");
      })
      .find((place) => {
        const filePath = path.join(place, "server/entry-server.js");
        return fs.existsSync(filePath);
      });

    if (!newPlace) {
      throw new Error("Can't find place!");
    }

    return newPlace;
  }
}

export async function createServer() {
  const app = fastify();
  await app.register(fastifyExpress);

  const vite = isProd
    ? undefined
    : await createViteServer({
        server: { middlewareMode: true },
      });

  const distRoot = findDistRoot();

  if (vite) {
    app.use(vite.middlewares);
  } else {
    await app.register(fastifyStatic, {
      root: path.join(distRoot!, "client/assets"),
      prefix: "/assets/",
    });
  }

  app.all("*", async (req, reply) => {
    const request = new Request(req.url, {
      method: req.method,
      headers: [["Accept", String(req.headers.accept)]],
    });
    const { data, status, contentType } = await renderRequest(
      await getViteHandlers(vite, request.url),
      request,
      vite
    );
    reply.status(status).header("Content-Type", contentType).send(data);
  });

  return app;
}

export async function renderRequest(
  handlers: ViteHandlers,
  request: Request,
  vite?: ViteDevServer
): Promise<{ data: string; status: number; contentType: string }> {
  try {
    const { render } = handlers.serverEntry;
    const renderred: ServerResponse = await render(request, handlers.manifest);

    if (renderred.content.type === "html") {
      // 5. Inject the app-rendered HTML into the template.
      const html = handlers.template
        .replace(`<!--ssr-outlet-->`, renderred.content.value)
        .replace("<!--ssr-scripts-->", renderred.content.scripts);
      return { status: renderred.status, data: html, contentType: "text/html" };
    } else {
      return {
        status: renderred.status,
        contentType: "application/json",
        data: JSON.stringify(renderred.content.value),
      };
    }
  } catch (e) {
    // If an error is caught, let vite fix the stracktrace so it maps back to
    // your actual source code.
    vite?.ssrFixStacktrace(e);
    console.error(e);
    const message = request.headers.has("x-debug") ? String(e) : e.message;
    return { status: 500, data: message, contentType: "text/plain" };
  }
}

async function main() {
  const app = await createServer();
  app.listen(3000);
}

if (require.main === module) {
  main();
}

type ViteHandlers = {
  template: string;
  serverEntry: any;
  manifest?: Record<string, string[]>;
};

async function getViteHandlers(
  vite: ViteDevServer | undefined,
  url: string
): Promise<ViteHandlers> {
  if (!vite) {
    return {
      serverEntry: require("../dist/server/entry-server.js"),
      manifest: require("../dist/client/ssr-manifest.json"),
      template: fs.readFileSync(
        path.join(__dirname, "../dist/client/index.html"),
        "utf8"
      ),
    };
  } else {
    const rawTemplate = fs.readFileSync(
      path.join(__dirname, "../index.html"),
      "utf8"
    );
    const template = await vite.transformIndexHtml(url, rawTemplate);
    return {
      serverEntry: await vite.ssrLoadModule("/src/entry-server.tsx"),
      template,
    };
  }
}

const isProd = process.env.NODE_ENV === "production";
