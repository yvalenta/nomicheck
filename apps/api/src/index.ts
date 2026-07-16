import "dotenv/config";
import express from "express";
import cors from "cors";
import router from "./routes/index.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());
app.use("/api", router);

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
