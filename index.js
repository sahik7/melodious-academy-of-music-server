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
  console.log(authorization)
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
      console.log("user with token",user)
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





    app.get("/users/:email",validateToken, async (req, res) => {
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
      const filter = { id: id, email: email }
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
      if (specificClass) {
        const query = { id: specificClass, email: email }
        const enrolledClass = await myClassesCollection.findOne(query);
        return res.send(enrolledClass)
      }
      const myClasses = await myClassesCollection.find({ email }).toArray();
      res.send(myClasses);
    })

    // enrolled Classes
    app.get("/enrolled", async (req, res) => {
      const email = req.query.email;
      const paid = await enrolledClassesCollection.find({ email }).toArray()
      res.send(paid);
    })
    // upload enrolled Classes
    app.post("/enrolled", async (req, res) => {
      const enrolledItem = req.body;
      const Id = enrolledItem.id;
      
      const document = await classesCollection.findOne({ _id: new ObjectId(Id) });
      const updatedAvailableSeats = document.availableSeats;
      console.log(updatedAvailableSeats,enrolledItem.availableSeats)
      if(updatedAvailableSeats < enrolledItem.availableSeats){
        const updatedEnrolledItem = {
          ...enrolledItem,
          availableSeats: updatedAvailableSeats,
        };
        const enrolled = await enrolledClassesCollection.insertOne(updatedEnrolledItem)
        res.send(enrolled);
      }
      
      
    })



    // remove from my classes
    app.delete("/my-classes/:id", async (req, res) => {
      const id = req.params.id;
      const removeItem = await myClassesCollection.deleteOne({ id: id })
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



    app.patch("/classes/:id", async (req, res) => {
  const id = req.params.id;
  const payment = req.query.payment
  const { status, feedback } = req.body;
console.log(status ,feedback,payment,id)
  try {
    const query = { _id: new ObjectId(id) };
    const updateDoc = {};



    // Check if the status field is provided in the request
    if (status && !feedback) {
      updateDoc.$set = { status };
      const result = await classesCollection.updateOne(query,updateDoc)
      return res.send(result);
    }

    if (feedback) {
      const updateDoc = { $set: { feedback:feedback } };
  const result = await classesCollection.updateOne(query, updateDoc, { upsert: true });
  return res.send(result);
    }

    if (payment === "successful") {
      updateDoc.$inc = { availableSeats: -1, enrolledStudents: 1 };
      const result = await classesCollection.updateOne(query, updateDoc);
    return res.send(result);
    }

    
  } catch (error) {
    res.status(500).send("Error updating class");
  }
});


    //Payment Intent
    app.post("/create-payment-intent", validateToken, async (req, res) => {
      const body = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(body.price * 100),
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
    app.post("/payments", validateToken, async (req, res) => {
      const paymentInfo = req.body;
      const data = await paymentHistoryCollection.insertOne(paymentInfo)
      res.send(data)
    })

    //payment history
    app.get("/payment-history", async (req, res) => {
      const email = req.query.email
      const filter = {email:email}
      try {
        const paymentHistory = await paymentHistoryCollection
          .find(filter)
          .sort({ date: -1 })
          .toArray();
        res.send(paymentHistory);
      } catch (error) {
        console.error(error);
      }
    });


    

    app.get("/users", async (req, res) => {
      const {position,limit} = req.query
      if (position && limit) {
        const filter = { position: position };
        const limitValue = parseInt(limit, 10);
        const topInstructors = await usersCollection
          .find(filter)
          .limit(limitValue)
          .toArray();
        return res.send(topInstructors);
      }
      if (position) {
        const filter = { position: position }
        const usersByPosition = await usersCollection.find(filter).toArray();
        return res.send(usersByPosition)
      }
      const users = await usersCollection.find().toArray();
      res.send(users);
    })


    // All Classes
    app.get("/classes", async (req, res) => {
      const popularClasses = req.query.topClass;
      const email = req.query.email;
      const approved = req.query.approved;

      try {
        if (email) {
          const instructorClasses = await classesCollection.find({ instructorEmail: email }).toArray();
          return res.send(instructorClasses);
        } else if (popularClasses) {
          const popularClasses = await classesCollection
            .find()
            .sort({ enrolledStudents: -1 })
            .limit(6)
            .toArray();
          return res.send(popularClasses);
        } else if(approved){
          const filter = {status: "approved"}
          const approvedClasses = await classesCollection.find(filter).toArray();
          return res.send(approvedClasses);
        }
          // Fetch all classes
          const allClasses = await classesCollection.find().toArray();
          return res.send(allClasses);
        
      } catch (error) {
        console.error(error);
        res.status(500).send("Internal Server Error");
      }
    });

    // Add New Class
    app.post("/classes", async (req, res) => {
      try {
        const classData = req.body;

        const newClass = {
          ...classData,
          status: "pending",
          enrolledStudents: 0
        };
        const savedClass = await classesCollection.insertOne(newClass);
        res.send(savedClass);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
      }
    });




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
