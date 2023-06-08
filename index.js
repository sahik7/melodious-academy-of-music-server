const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
require("dotenv").config();

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rko4yag.mongodb.net/?retryWrites=true&w=majority`


// Middleware
app.use(cors())
app.use(express.json())




const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const usersCollection = client.db("academyDB").collection("users");

    // users API
    app.put("/users/:email", async (req, res) => {
        const userData = req.body;
        const email = req.params.email
        const query = {email:email}
        const options = {upsert: true}
        const updateDoc = {
          $set: {
            position: "student",
            ...userData
          }
        };
        const result = await usersCollection.updateOne(query,updateDoc,options);
        console.log(result);
        res.send(result);
    })

    app.patch("/users/:id", async(req, res) => {
        const id = req.params.id
        const query = {_id: new ObjectId(id)}
        const options = {upsert: true}
        const updateDoc = {
            $set: {
              position:"admin"
            }
        }
        const result = await usersCollection.updateOne(query,updateDoc,options);
        res.send(result);
    })


    app.get("/users", async (req, res) => {
        const users = await usersCollection.find().toArray();
        res.send(users);
    })



    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('server Server is running..')
  })


app.listen(port, () => {
    console.log(`server is running on port ${port}`)
  })
