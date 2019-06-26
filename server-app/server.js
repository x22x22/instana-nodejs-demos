/* global Promise */

'use strict';

require('@instana/collector')();

const {ApolloServer, gql} = require('apollo-server-express');
const bodyParser = require('body-parser');
const express = require('express');
const graphqlSubscriptions = require('graphql-subscriptions');
const http = require('http');
const morgan = require('morgan');

const port = process.env.APP_PORT || 3217;
const app = express();
const pubsub = new graphqlSubscriptions.PubSub();

const logPrefix = `GraphQL/Apollo Server (${process.pid}):\t`;

if (process.env.WITH_STDOUT) {
  app.use(morgan(`${logPrefix}:method :url :status`));
}

app.use(bodyParser.json());

const typeDefs = gql`
  type Query {
    Users(email: String): [User]
    Orders: [Order]
  }

  type Mutation {
    UpdateUser(input: UserUpdateInput): User
  }

  type Subscription {
    OnUserUpdated(id: ID!): User
  }

  type User {
    id: ID
    name: String
    email: String
    address: String
  }

  type Order {
    id: ID
    items: String
  }

  input UserUpdateInput {
    id: ID!
    name: String
    email: String
    address: String
  }
`;

const resolvers = {
  Query: {
    Users: () => [
      {
        id: 1234,
        name: 'Alice',
        email: 'alice@example.com',
        address: 'Redacted',
      },
      {
        id: 1235,
        name: 'Bob',
        email: 'bob@example.com',
        address: 'Redacted',
      },
    ],
    Orders: () => [
      {
        id: 987654321,
        items: 'Such GraphQL tracing. Much wow',
      },
    ],
  },
  Mutation: {
    UpdateUser: (root, {input}) => {
      return {
        id: 1234,
        name: 'Alicia',
        email: 'alicia@example.com',
        address: 'Redacted',
      };
    },
  },
  Subscription: {
    OnUserUpdated: {
      subscribe: (__, {id}) => {
        return pubsub.asyncIterator('OnUserUpdated');
      },
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.post('/publish-update', (req, res) => {
  let {id, name} = req.body;
  if (id == null) {
    id = 1234;
  }
  if (typeof id === 'string') {
    id = parseInt(id, 10);
  }
  if (isNaN(id) || id <= 0) {
    id = 1234;
  }
  const updatedUser = {
    id: 1234,
    name: name | 'Alicia',
    email: 'alicia@example.com',
    address: 'Still Redacted',
  };
  pubsub.publish('OnUserUpdated', {
    OnUserUpdated: updatedUser,
  });
  res.send(updatedUser);
});

server.applyMiddleware({app});

const httpServer = http.createServer(app);
server.installSubscriptionHandlers(httpServer);

httpServer.listen({port}, () => {
  log(
    `Listening on ${port} (HTTP & Websocket), GraphQL endpoint: http://localhost:${port}${server.graphqlPath}`,
  );
});

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}