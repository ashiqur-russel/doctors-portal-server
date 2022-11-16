const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.removeListener.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("Server is Running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.irpitar.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const timeSlotConnection = client
      .db("doctors-portal")
      .collection("timeSlots");

    const bookingCollection = client
      .db("doctors-portal")
      .collection("bookings");

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const query = {};
      const options = await timeSlotConnection.find(query).toArray();
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
        console.log(date, option.name, bookedSlot);
      });

      res.send(options);
    });

    /***
     * bookings API naming convention
     * app.get('/bookings)
     * app.get('/bookings/:id)
     * app.post('/bookings)
     * app.patch('/bookings/:id)
     ***/

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      console.log(booking);
      const result = await bookingCollection.insertOne(booking);
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.log());

app.listen(port, () => console.log(`Dpctprs Portal running on ${port}`));
