import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { UserProfileService } from "./proto/user_profile/user_profile_pb";

const transport = createGrpcWebTransport({
  baseUrl: "/server", // Vite proxy handles redirection for dev mode
});

export const serverClient = createClient(UserProfileService, transport);
