// index.js
import express from "express";
import cors from "cors";
import OSRM from "@project-osrm/osrm";
import { cpus } from "node:os";
const cpu = cpus();
process.env.UV_THREADPOOL_SIZE = Math.ceil(cpu.length * 1.5);

const port = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.options("*", cors());
const osrm = new OSRM({
  algorithm: "MLD",
  path: "../data/india-latest.osrm",
});

function route(req, res) {
  // overview=false&alternatives=true&steps=true&hints=;
  // Query values are strings: Boolean("false") would be true, so compare explicitly.
  const alternatives = req.query?.alternatives === "true";
  const steps = req.query?.steps === "true";
  const overview = req.query?.overview || "simplified";

  let { coordinates } = req.params;
  coordinates = coordinates.split(";").map((pair) => pair.split(",").map(Number));
  if (
    coordinates.length < 2 ||
    coordinates.some((c) => c.length !== 2 || c.some((n) => !Number.isFinite(n)))
  ) {
    return res
      .status(400)
      .json({ code: "InvalidQuery", message: "Invalid coordinates" });
  }
  var options = {
    coordinates,
    alternatives,
    steps,
    overview,
  };
  console.log(options);

  osrm.route(options, function (err, result) {
    if (err) {
      console.log(err);
      return res.status(400).json({
        code: "NoRoute",
        message: err.message,
      });
    } else {
      result.code = "Ok";
      return res.json(result);
    }
  });
}

app.get("/route/v1/driving/:coordinates", route);
app.listen(port);
