const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const uuid = require("uuid");
const natural = require("natural");
const cors = require("cors");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
const prisma = new PrismaClient();
const tokenizer = new natural.WordTokenizer();

// Middleware for parsing JSON
app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: true,
  auth: {
    user: process.env.USER,
    pass: process.env.APP_PASSWORD,
  },
});

async function sendMail(mailOpt) {
  try {
    const sendMail = await transporter.sendMail(mailOpt);
    console.log("email send sucessfully");
  } catch (error) {
    console.log(error);
  }
}

// token verification

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ success: false, message: "No token provided." });
  }

  try {
    const decodedToken = jwt.verify(token, "your-secret-key");
    // console.log(decodedToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// Register endpoint
app.post("/register", async (req, res) => {
  try {
    const { email, name, password } = req.body;

    const checkUserExist = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!checkUserExist) {
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save the user to the database
      // const user = new User({ username, password: hashedPassword });
      // await user.save();

      const user = await prisma.user.create({
        data: {
          email: email,
          password: hashedPassword,
          name: name,
        },
      });

      const info = {
        from: {
          name: "Cutomer service Image",
          address: process.env.USER,
        }, // sender address
        to: email, // list of receivers
        subject: "Successfully registered", // Subject line
        text: "Hello world?", // plain text body
        html: "<b>Hello world?</b>", // html body
      };

      const sendMain = sendMail(info);

      res.status(201).json({ message: "User registered successfully" });
    } else {
      res.status(201).json({ message: "User Already Exist" });
    }

    // Hash the password
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Login endpoint
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: {
        email: email,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare the provided password with the hashed password in the database
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create a JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      "your-secret-key",
      { expiresIn: "24h" }
    );

    res.cookie("token", token, { httpOnly: true, maxAge: 3600000 });

    res.json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/username", async (req, res) => {
  const { id } = req.query;
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: id,
      },
    });
    delete user.password;
    if (!user) {
      res.json({
        status: false,
        message: "No user Found",
      });
    }

    res.json({ status: true, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.post("/register-complaint", verifyToken, async (req, res) => {
  const { email, userName, message, productName, topic } = req.body;
  const uniqueId = generateRandomCode();
  const userId = req.user.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const existingUser = await prisma.user.findUnique({
      where: { email: email },
    });

    const registerUser = async () => {
      const randomPassword = generateRandomPassword();
      const hashPassword = await bcrypt.hash(randomPassword, 10);

      const newUser = await prisma.user.create({
        data: {
          email: email,
          password: hashPassword,
          name: userName,
        },
      });

      return { user: newUser, password: randomPassword };
    };

    const createUserIfNotExist = async () => {
      if (!existingUser) {
        return await registerUser();
      }

      return { user: existingUser, password: null };
    };

    const tags = await extractTags(message);
    const noTag = "service";

    const statusChangeMessage =
      "Complaint registered Lorem ipsum dolor sit amet consectetur adipisicing elit. Asperiores magni illum sint sunt, perspiciatis corrupti";

    const { user: registeredUser, password } = await createUserIfNotExist();

    const register = await prisma.complaints.create({
      data: {
        email: email,
        complaintNumber: uniqueId,
        message: message,
        productName: productName,
        topic: topic,
        user: { connect: { id: registeredUser.id } },
        registerdBy: user && user.name ? user.name : "Unknown User",
        tag: tags[0] || noTag,
        statusChangeMessages: {
          create: {
            heading: "Complaint registered",
            message: statusChangeMessage || "Complaint has been registered",
          },
        },
      },
      include: {
        statusChangeMessages: true,
      },
    });

    if (register) {
      const complaintInfo = {
        from: {
          name: "Customer service Image",
          address: process.env.USER,
        },
        to: email,
        subject: "Complaint registered successfully",
        text: "Your Complaint is successfully registered. You can log in with your email for follow-up.",
        html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Complaint Registration</title><style>body{font-family:Arial, sans-serif;line-height:1.6;margin:0;padding:20px;background-color:#f4f4f4;}.container{max-width:600px;margin:0 auto;background-color:#fff;padding:20px;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.1);}.header{text-align:center;margin-bottom:20px;}.complaint-info{margin-bottom:20px;}.complaint-info b{font-weight:bold;}.footer{text-align:center;margin-top:20px;color:#666;font-size:12px;}</style></head><body><div class="container"><div class="header"><h2>Complaint Registration</h2></div><div class="complaint-info"><p><b>Complaint ID:</b> ${uniqueId}</p>${
          password
            ? `<div><p>Enter this Credential to login out CRM </p><br /><p><b>Email:</b> ${email}</p><p><b>Password:</b> ${password}</p></div>`
            : ""
        }</div><div class="footer"><p>Thank you for using our service!</p></div></div></body></html>
`,
      };

      const sendMailResult = await sendMail(complaintInfo);

      res.json({
        message: "successful registration",
        registeredId: register.complaintNumber,
        register,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/register-employee", verifyToken, async (req, res) => {
  const { email, name, role } = req.body;
  try {
    const checkUserExist = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!checkUserExist) {
      const password = generateRandomPassword();
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save the user to the database
      // const user = new User({ username, password: hashedPassword });
      // await user.save();

      const user = await prisma.user.create({
        data: {
          email: email,
          password: hashedPassword,
          name: name,
          role: role,
        },
      });

      const info = {
        from: {
          name: "Cutomer service Image",
          address: process.env.USER,
        }, // sender address
        to: email, // list of receivers
        subject: "Successfully registered", // Subject line
        text: "Hello world?", // plain text body
        html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Complaint Registration</title><style>body{font-family:Arial, sans-serif;line-height:1.6;margin:0;padding:20px;background-color:#f4f4f4;}.container{max-width:600px;margin:0 auto;background-color:#fff;padding:20px;border-radius:5px;box-shadow:0 0 10px rgba(0,0,0,0.1);}.header{text-align:center;margin-bottom:20px;}.complaint-info{margin-bottom:20px;}.complaint-info b{font-weight:bold;}.footer{text-align:center;margin-top:20px;color:#666;font-size:12px;}</style></head><body><div class="container"><div class="header"><h2>User Sucessfully Registered</h2></div><div class="complaint-info"><p>${
          password
            ? `<div><p>Enter this Credential to login out CRM </p><br /><p><b>Email:</b> ${email}</p><p><b>Password:</b> ${password}</p></div>`
            : ""
        }</div><div class="footer"><p>Thank you for using our service!</p></div></div></body></html>
`, // html body
      };

      const sendMain = sendMail(info);

      res.status(201).json({ message: "User registered successfully" });
    } else {
      res.status(201).json({ message: "User Already Exist" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.post("/update-complaint", verifyToken, async (req, res) => {
  const { complaintNumber, status, message, heading } = req.body;
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
    });

    if (
      user.role === "ADMIN" ||
      user.role === "PAYMENT" ||
      user.role === "SERVICE" ||
      user.role === "PRODUCT"
    ) {
      const updatedComplaint = await prisma.complaints.update({
        where: { complaintNumber: complaintNumber },
        data: {
          status: status,
          statusChangeMessages: {
            create: {
              status: status,
              heading: heading,
              message: message,
            },
          },
        },
      });

      if (updatedComplaint) {
        console.log("hello");
        res.json({
          message: "success",
          complaint: updatedComplaint,
        });
      }
    } else {
      res.json({
        message: " You dont have the permision to edit",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.userId,
      },
      include: {
        complaints: true,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    delete user.password;
    res.json({ success: true, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// Protected route example
app.get("/protected", (req, res) => {
  // Extract the token from the request header
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decodedToken = jwt.verify(token, "your-secret-key");
    console.log(decodedToken);

    res.json({ message: "Protected route accessed successfully" });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/get-complaints", verifyToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.userId,
    },
    include: { complaints: true },
  });
  try {
    if (user.role === "ADMIN") {
      const complaints = await prisma.complaints.findMany();
      if (!complaints) {
        res.json({
          message: "Sorry No Complaints for Pending",
        });
      }
      res.json({
        message: "Sucessfull",
        complaints,
      });
    } else if (user.role === "SERVICE") {
      const complaints = await prisma.complaints.findMany({
        where: {
          tag: "service",
        },
      });

      if (!complaints) {
        res.json({
          message: "Sorry No Complaints for service Section",
        });
      }
      res.json({
        message: "Sucessfull",
        complaints,
      });
    } else if (user.role === "PRODUCT") {
      const complaints = await prisma.complaints.findMany({
        where: {
          tag: "product",
        },
      });

      if (!complaints) {
        res.json({
          message: "Sorry No Complaints for Product Section",
        });
      }
      res.json({
        message: "Sucessfull",
        complaints,
      });
    } else if (user.role === "PAYMENT") {
      const complaints = await prisma.complaints.findMany({
        where: {
          tag: "payment",
        },
      });

      if (!complaints) {
        res.json({
          message: "Sorry No Complaints for payment Section",
        });
      }
      res.json({
        message: "Sucessfull",
        complaints,
      });
    } else if (user.role === "USER") {
      // const user = await prisma.user.findUnique({
      //   where: {
      //     id: user.id,
      //   },
      //   include: {
      //     complaints: true,
      //   },
      // });

      if (!user.complaints) {
        res.json({
          message: "Sorry No Complaints for payment Section",
        });
      }
      res.json({
        message: "Sucessfull",
        complaints: user.complaints,
      });
    } else {
      res.json({
        message: "Sorry You dont have Access",
      });
    }
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.post("/find-complaint-details", verifyToken, async (req, res) => {
  const { complaintNumber } = req.body;
  try {
    const fetchDetails = await prisma.complaints.findUnique({
      where: {
        complaintNumber: complaintNumber,
      },
      include: {
        statusChangeMessages: true,
      },
    });
    res.json({
      message: "sucessfull",
      complaint: fetchDetails,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
    console.log(error);
  }
});

app.post("/update-tag", verifyToken, async (req, res) => {
  const { complaintNumber, tag } = req.body;
  const user = await prisma.user.findUnique({
    where: {
      id: req.user.userId,
    },
  });

  try {
    if (user.role === "SERVICE") {
      const update = await prisma.complaints.update({
        where: {
          complaintNumber: complaintNumber,
        },
        data: {
          tag: tag,
        },
      });
      res.json({
        message: "Sucess",
        complaint: update,
      });
    } else {
      res.json({
        message: "This User cannot Update the Complaints",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
    console.log(error);
  }
});

// async function extractTags(paragraph) {
//   const words = await tokenizer.tokenize(paragraph);

//   // Define your list of keywords or patterns to identify tags
//   const tagKeywords = [
//     "product",
//     "payment",
//     /* add more keywords */
//   ];

//   // Initialize a Set to store unique extracted tags
//   const uniqueTags = new Set();

//   words.forEach((word) => {
//     // Check if the word matches any tag keyword (with case-insensitive comparison)
//     if (tagKeywords.some((keyword) => word.toLowerCase().includes(keyword))) {
//       uniqueTags.add(word.toLowerCase());
//     }
//   });

//   // If no matching keywords found, default to "service"
//   if (uniqueTags.size === 0) {
// uniqueTags.add("service");
//   }

//   // Convert the Set to an array before returning
//   return Array.from(uniqueTags);
// }

async function extractTags(paragraph) {
  const words = await tokenizer.tokenize(paragraph);

  // Define your lists of keywords or patterns to identify tags
  const productIssueSynonyms = [
    "Defect",
    "Fault",
    "Product",
    "Glitch",
    "Bug",
    "Flaw",
    "fault",
    "scratch",
    "Issue",
    "Hitch",
    "Snag",
    "Quirk",
    "Malfunction",
    "Anomaly",
    "Drawback",
    "Complication",
    "Setback",
    "Concern",
    "Dilemma",
    "Challenge",
    "Obstacle",
    "Impediment",
  ];

  const paymentSynonyms = [
    "Remittance",
    "payment",
    "Transaction",
    "Settlement",
    "Compensation",
    "Reimbursement",
    "Disbursement",
    "Remuneration",
    "Grant",
    "Funding",
    "Honorarium",
    "Stipend",
    "Award",
    "Contribution",
    "Advance",
    "Dues",
    "Payout",
    "Fee",
    "Wage",
    "Royalty",
    "Salary",
    "cashback",
    "cash",
  ];

  // Initialize a Set to store unique extracted tags
  const uniqueTags = new Set();

  words.forEach((word) => {
    // Check if the word matches any product issue synonym (case-insensitive comparison)
    if (
      productIssueSynonyms.some((synonym) =>
        word.toLowerCase().includes(synonym.toLowerCase())
      )
    ) {
      uniqueTags.add("product");
    }

    // Check if the word matches any payment synonym (case-insensitive comparison)
    if (
      paymentSynonyms.some((synonym) =>
        word.toLowerCase().includes(synonym.toLowerCase())
      )
    ) {
      uniqueTags.add("payment");
    }
  });

  // If no matching keywords found, default to "Service"
  if (uniqueTags.size === 0) {
    uniqueTags.add("service");
  }

  // Convert the Set to an array before returning
  return Array.from(uniqueTags);
}

app.post("/extract-tags", async (req, res) => {
  try {
    const { paragraph } = req.body;

    if (!paragraph) {
      return res
        .status(400)
        .json({ error: "Paragraph is required in the request body." });
    }

    const extractedTags = await extractTags(paragraph);
    res.json({ tags: extractedTags });
  } catch (error) {
    console.error("Error extracting tags:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

function generateRandomCode() {
  // Generate a random 5-byte (10-digit) hex string
  const randomBytes = crypto.randomBytes(5);
  const code = randomBytes.toString("hex").toUpperCase().slice(0, 10);

  return code;
}

function generateRandomPassword(length = 12) {
  const characters =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_-+=";
  let password = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    password += characters.charAt(randomIndex);
  }

  return password;
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
