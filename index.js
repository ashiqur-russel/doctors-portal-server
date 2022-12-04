const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.removeListener.PORT || 5000;
const app = express();
//middleare
app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("Unauthorized Access!");
  }

  const token = authHeader.split(" ")[1];
  console.log("inside verify jwt", token);

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.irpitar.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const appointmentOptionsCollection = client
      .db("doctors-portal")
      .collection("appointmentOptions");

    const bookingCollection = client
      .db("doctors-portal")
      .collection("bookings");
    const usersCollection = client.db("doctors-portal").collection("users");
    const doctorsCollection = client.db("doctors-portal").collection("doctors");

    //generate token
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1d",
        });
        res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "No Access Token" });
    });

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const query = {};
      const options = await appointmentOptionsCollection.find(query).toArray();
      const bookingQuery = {
        appointmentDate: date,
      };

      const alreadyBooked = await bookingCollection
        .find(bookingQuery)
        .toArray();

      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (book) => book.treatment === option.name
        );
        const bookedSlot = optionBooked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlot.includes(slot)
        );

        option.slots = remainingSlots;
      });

      res.send(options);
    });

    //get Speciality

    app.get("/appointmentSpeciality", async (req, res) => {
      const query = {};
      const result = await appointmentOptionsCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    /***
     * bookings API naming convention
     * app.get('/bookings)
     * app.get('/bookings/:id)
     * app.post('/bookings)
     * app.patch('/bookings/:id)
     ***/
    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const bookings = await bookingCollection.find(query).toArray();
      res.send(bookings);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);

      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,

        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have a booking on ${booking.appointmentDate} `;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });

    /* Users API */

    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log(user);
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //get all users
    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });
    app.put("/users/admin/:id", verifyJWT, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      const id = req.params.id;

      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //add doctor
    app.post("/doctors", async (req, res) => {
      const data = req.body;
      console.log(data);
      const result = await doctorsCollection.insertOne(data);
      res.send(result);
    });
    //get doctor
    app.get("/doctors", async (req, res) => {
      const query = {};
      const result = await doctorsCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.log());

app.listen(port, () => console.log(`Dpctprs Portal running on ${port}`));
