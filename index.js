require("dotenv").config();
const express = require('express');
const stripe = require("stripe")(process.env.PAYMENT_CODE);
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
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
    const myClassesCollection = client.db("academyDB").collection("myClasses");
    const enrolledClassesCollection = client.db("academyDB").collection("enrolledClasses");
    const paymentHistoryCollection = client.db("academyDB").collection("paymentHistory");


    app.post("/token", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_PRIVATE_TOKEN)
      res.send({ token })
    })

    // users API
    // Register a new user
    app.put("/users/:email", async (req, res) => {
      const userData = req.body;
      console.log(userData)
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


    // app.get("/users/:email", validateToken, async (req, res) => {
    //   const email = req.params.email;
    //   const query = { email:email }
    //   const decodedtoken = req.tokenDecoded;
    //   if (decodedtoken.email !== email) {
    //     return res.status(403).send({ error: true, message: "Access Forbidden: Unauthorized Breach" });
    //   }
    //   const user = await usersCollection.findOne(query);
    //   const result = {admin:user?.position === "admin"}
    //   res.send(result)
    // })

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { position: user?.position }
      res.send(result)
    })


    // my classes
    app.put("/my-classes/:id", async (req, res) => {
      const id = req.params.id
      const myClassInfo = req.body
      const email = myClassInfo.email
      const filter = { id: id , email:email}
      const updateDoc = {
        $set: {
          ...myClassInfo
        }
      }
      try {
        const existingClass = await myClassesCollection.findOne(filter);

        if (existingClass) {
          res.send({ message: "Document already exists" });
        } else {
          const result = await myClassesCollection.updateOne(filter, updateDoc, { upsert: true });
          res.send(result);
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
      }
    })
    // collect My classes
    app.get("/my-classes/:email", async (req, res) => {
      const specificClass = req.query.specificClass;
      const email = req.params.email;
      if(specificClass){
        const query = {id: specificClass, email:email}
        console.log(specificClass)
        const enrolledClass = await myClassesCollection.findOne(query);
        return res.send(enrolledClass)
      }
      const myClasses = await myClassesCollection.find({ email }).toArray();
      res.send(myClasses);
    })

// enrolled Classes
app.post("/enrolled",async (req, res) => {
  const enrolledItem = req.body;
  console.log(enrolledItem)
  const enrolled = await enrolledClassesCollection.insertOne(enrolledItem)
  res.send(enrolled);
})



    // remove from my classes
    app.delete("/my-classes/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const removeItem = await myClassesCollection.deleteOne({ id:id })
      res.send(removeItem);

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

    //Payment Intent
    app.post("/create-payment-intent",validateToken, async (req, res) => {
      const body = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(body.price*100),
        currency: "usd",
        payment_method_types: [
          "card"
        ],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })
    // payment history
    app.post("/payments", validateToken, async(req, res) => {
      const paymentInfo = req.body;
      const data = await paymentHistoryCollection.insertOne(paymentInfo)
      res.send(data)
    })


    app.get("/users", validateToken, async (req, res) => {
      const decodedtoken = req.tokenDecoded;
      if (!decodedtoken.email) {
        return res.status(403).send({ error: true, message: "Access Forbidden: Unauthorized Breach" });
      }
      const users = await usersCollection.find().toArray();
      res.send(users);
    })


    // All Classes
    app.get("/classes", async (req, res) => {
      const popularClasses = req.query.topClass;
      const email = req.query.email;
      console.log(email);
      
      try {
        if (email) {
          const instructorClasses = await classesCollection.find({ instructorEmail: email }).toArray();
          res.send(instructorClasses);
        } else if (popularClasses) {
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
      } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      }
    });

// Add New Class
app.post("/classes", async (req, res) => {
  try {
    const classData = req.body;
    console.log(classData)
    
    const newClass = {
      ...classData,
      status: "pending",
      enrolledStudents: 0
    };
    console.log(newClass)
    const savedClass = await classesCollection.insertOne(newClass);
    res.send(savedClass);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// app.get("/classes", async (req, res) => {

// }
    



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
