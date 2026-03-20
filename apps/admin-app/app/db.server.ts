import * as PrismaClientPackage from "@prisma/client";

type ModelDelegate = Record<string, (...args: unknown[]) => Promise<unknown>>;

type PrismaClientInstance = {
  $connect: () => Promise<void>;
  $disconnect: () => Promise<void>;
  session: ModelDelegate;
} & Record<string, unknown>;

type PrismaClientConstructor = new () => PrismaClientInstance;

const { PrismaClient } = PrismaClientPackage as {
  PrismaClient?: PrismaClientConstructor;
};

if (!PrismaClient) {
  throw new Error(
    "@prisma/client does not currently export PrismaClient. Run `pnpm prisma generate` to generate the Prisma client before starting the app.",
  );
}

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClientInstance | undefined;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;
