import express from "express";
import cors from "cors";
import { apiRouter } from "../../../workspace/shop-api/src/api.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(apiRouter);

const port = Number(process.env.SHOP_API_PORT ?? 3002);
app.listen(port, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(`shop-api worker listening on ${port}`);
});