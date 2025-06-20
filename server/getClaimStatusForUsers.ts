"use server";
import { gql, request } from "graphql-request";
const url = process.env.THE_GRAPH_URL!;
const headers = { Authorization: `Bearer ${process.env.THE_GRAPH_API_KEY}` };

const query = gql`
  {
    claimAccessRequests(
      orderBy: blockTimestamp
      orderDirection: desc
      where: { access: false }
    ) {
      id
      user
      access
      blockTimestamp
    }
  }
`;

export const getClaimStatusForUsers = async () => {
  return await request(url, query, {}, headers);
};
