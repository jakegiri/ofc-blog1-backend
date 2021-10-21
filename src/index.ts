import {
  ApolloServerPluginDrainHttpServer,
  ApolloServerPluginLandingPageDisabled,
  ApolloServerPluginLandingPageGraphQLPlayground,
} from "apollo-server-core";
import { ApolloServer } from "apollo-server-express";
import connectRedis from "connect-redis";
import cors, { CorsOptions } from "cors";
import express from "express";
import session, { SessionOptions } from "express-session";
import http from "http";
import path from "path";
import "reflect-metadata";
import { buildSchema } from "type-graphql";
import redis from "./clients/redisClient";
import { context } from "./context";
import { ConfirmUserResolver } from "./modules/user/ConfirmUser";
import { LoginResolver } from "./modules/user/Login";
import { RegisterResolver } from "./modules/user/Register";
import { queryComplexityRule } from "./utils/queryComplexityRule";

//###############   End of imports   ######################
//#########################################################

const schemaSDLPath = path.resolve(
  __dirname,
  "__snapshot__",
  "schema",
  "schema.gql"
);

const corsOptions: CorsOptions = {
  credentials: true,
  origin: ["http://localhost:4000", "https://studio.apollographql.com"],
};

const RedisStore = connectRedis(session);

const sessionOptions: SessionOptions = {
  store: new RedisStore({ client: redis }),
  name: "qid",
  saveUninitialized: false,
  secret: "keyboard cat",
  resave: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 365 * 7, // 7years
  },
};

const graphQLPlaygroundPlugin =
  process.env.NODE_ENV === "production"
    ? ApolloServerPluginLandingPageDisabled()
    : ApolloServerPluginLandingPageGraphQLPlayground();

const schemaHelper = async () => {
  const schemad = await buildSchema({
    resolvers: [RegisterResolver, ConfirmUserResolver, LoginResolver], // Using this emit expected resolvers
    // resolvers: [__dirname + "/modules/**/*.ts"], Using this emit unexpectedly all resolvers and types from generated type-graphql via typegraphql-prisma
    emitSchemaFile: schemaSDLPath,
  });
};

//#########################################################################
//#########################################################################
//#############          (MAIN FUNCTION)             ######################
//#############        -startApolloServer-           ######################
//#########################################################################
//#########################################################################

async function startApolloServer() {
  const schema = await buildSchema({
    resolvers: [RegisterResolver, ConfirmUserResolver, LoginResolver],
    emitSchemaFile: schemaSDLPath,
  });

  const app = express();
  const httpServer = http.createServer(app);
  const apolloServer = new ApolloServer({
    schema: schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      graphQLPlaygroundPlugin,
    ],
    validationRules: [queryComplexityRule],
    context: context,
  });
  await apolloServer.start();

  //#######################################
  //    MOUNT APOLLO MIDDLEWARE HERE
  //#######################################
  app.use(cors(corsOptions));
  app.use(session(sessionOptions));

  //#######################################
  //  ---X---   END OF MIDDLWARE   ---X---
  //#######################################

  apolloServer.applyMiddleware({ app, cors: false });
  await new Promise<void>((resolve) =>
    httpServer.listen({ port: 4000 }, resolve)
  );
  console.log(
    `Server ready at http://localhost:4000${apolloServer.graphqlPath}`
  );
}

startApolloServer();
