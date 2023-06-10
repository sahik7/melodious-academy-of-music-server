const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
require("dotenv").config();
const jwt = require("jsonwebtoken")

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.rko4yag.mongodb.net/?retryWrites=true&w=majority`


// Middleware
app.use(cors())
app.use(express.json())


const validateToken = (req, res, next) => {
  const authorization = req.headers.authorization
  switch (authorization) {
    case false:
      return res.status(401).send({ error: true, message: "Unauthorized Breach" });
  }
  //TOKEN
  console.log(authorization)
  const token = authorization?.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_PRIVATE_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(401).send({ error: true, message: "Unauthorized Breach" });
    }
    req.tokenDecoded = decoded;
    next()
  });
}




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
    const classesCollection = client.db("academyDB").collection("classes");


    app.post("/token", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_PRIVATE_TOKEN)
      res.send({ token })
    })

    // users API
    // Register a new user
    app.put("/users/:email", async (req, res) => {
      const userData = req.body;
      const email = req.params.email
      const query = { email: email }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          position: "student",
          ...userData
        }
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    })


    app.get("/users/:email", validateToken, async (req, res) => {
      const email = req.params.email;
      const query = { email:email }
      const decodedtoken = req.tokenDecoded;
      if (decodedtoken.email !== email) {
        return res.status(403).send({ error: true, message: "Access Forbidden: Unauthorized Breach" });
      }
      const user = await usersCollection.findOne(query);
      const result = {admin:user?.position === "admin"}
      res.send(result)
    })

    // admin change the position
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id
      const { position } = req.body;

      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          position: position
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    })


    app.get("/users", validateToken, async (req, res) => {
      const decodedtoken = req.tokenDecoded;
      console.log(decodedtoken);
      if (!decodedtoken.email) {
        return res.status(403).send({ error: true, message: "Access Forbidden: Unauthorized Breach" });
      }
      const users = await usersCollection.find().toArray();
      res.send(users);
    })

    // Classes
    app.get("/classes",async (req, res) => {
      const popularClasses = req.query.topClass;
      if (popularClasses) {
        const popularClasses = await classesCollection
          .find()
          .sort({ enrolledStudents: -1 })
          .limit(6)
          .toArray();
    
        res.send(popularClasses);
      } else {
        // Fetch all classes
        const allClasses = await classesCollection.find().toArray();
        res.send(allClasses);
      }
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
