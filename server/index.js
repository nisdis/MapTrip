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
  const alternatives = Boolean(req.query?.alternatives);
  const steps = Boolean(req.query?.steps);
  const overview = req.query?.overview;

  let { coordinates } = req.params;
  coordinates = coordinates.split(";");
  for (var i = 0; i < coordinates.length; i++) {
    coordinates[i] = coordinates[i].split(",").map(Number);
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
      return res.json({
        error: err.message,
      });
    } else {
      result.code = "Ok";
      return res.json(result);
    }
  });
}

app.get("/route/v1/driving/:coordinates", route);
app.listen(port);
