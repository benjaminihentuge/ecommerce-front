import { mongooseConnect } from "@/lib/mongoose";
import { Order } from "@/models/Order";

export default async function handler(req, res) {
  // Verify the webhook
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const paystackSignature = req.headers["x-paystack-signature"];

  if (!paystackSignature) {
    res.status(400).send("Missing signature");
    return;
  }

  // Parse the body
  const rawBody = JSON.stringify(req.body);

  if (paystackSignature !== secret) {
    res.status(400).send("Invalid signature");
    return;
  }

  const event = req.body;

  switch (event.event) {
    case "charge.success":
      const metadata = event.data.metadata;
      const orderId = metadata?.orderId;
      const paid = event.data.status === "success";

      if (orderId && paid) {
        await mongooseConnect();
        await Order.findByIdAndUpdate(orderId, {
          paid: true,
        });
      }
      break;

    default:
      console.log(`Unhandled event type: ${event.event}`);
  }

  res.status(200).send("Webhook received");
}
