// Vercel Function: /api/stripe-webhook — eventos de assinatura do Stripe. Ver server/billing.ts.
import { handleStripeWebhook } from "../server/billing.js";
import { serviceClient } from "../server/connections.js";

const handle = (request: Request) => handleStripeWebhook(request, process.env, serviceClient(process.env));
export { handle as POST };
