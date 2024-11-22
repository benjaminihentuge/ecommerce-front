import { mongooseConnect } from "@/lib/mongoose";
import { Product } from "@/models/Product";
import { Order } from "@/models/Order";
import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Only POST requests are allowed." });
    return;
  }

  const { name, email, city, postalCode, streetAddress, country, cartProducts } = req.body;

  // Connect to the database
  await mongooseConnect();

  // Fetch product details for unique product IDs
  const productsIds = cartProducts;
  const uniqueIds = [...new Set(productsIds)];
  const productsInfos = await Product.find({ _id: { $in: uniqueIds } });

  // Prepare line items with detailed structure
  let line_items = [];
  for (const productId of uniqueIds) {
    const productInfo = productsInfos.find((p) => p._id.toString() === productId);
    const quantity = productsIds.filter((id) => id === productId)?.length || 0;

    if (quantity > 0 && productInfo) {
      line_items.push({
        quantity,
        price_data: {
          currency: "USD", // Assuming Paystack supports your currency configuration
          product_data: { name: productInfo.title },
          unit_amount: productInfo.price * 100, // Convert to kobo for Paystack
        },
      });
    }
  }

  // Calculate total amount for Paystack
  const totalAmount = line_items.reduce((sum, item) => sum + item.quantity * (item.price_data.unit_amount / 100), 0) * 100; // Convert to kobo

  // Create the order in the database
  const orderDoc = await Order.create({
    line_items,
    name,
    email,
    city,
    postalCode,
    streetAddress,
    country,
    paid: false,
  });

  // Initialize Paystack payment
  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: totalAmount,
        metadata: {
          orderId: orderDoc._id.toString(),
          line_items, // Include line items for reference
        },
        callback_url: process.env.PUBLIC_URL + "/cart?success=1",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    res.json({
      url: response.data.data.authorization_url,
    });
  } catch (error) {
    console.error("Error initializing Paystack transaction:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create Paystack transaction." });
  }
}
