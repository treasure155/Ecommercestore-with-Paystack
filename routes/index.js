const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const axios = require('axios');
const nodemailer = require('nodemailer');

// Mock product data
const products = [
    {
        id: 1,
        name: 'Spectra Nova X5',
        price: 100,
        description: 'A sleek and powerful smartphone featuring a 6.7-inch OLED display, 108MP quad-camera system, 5G connectivity, and a 5000mAh battery for all-day performance and stunning photography.',
        imageUrl: '/images/phone 1.png'
    },
    {
        id: 2,
        name: 'Astra Prime S10',
        price: 100,
        description: 'Experience the future with Astra Prime S10, boasting an 8K video recording, ultra-fast Snapdragon 888 processor, 120Hz refresh rate, and advanced AI capabilities for an immersive and intelligent user experience.',
        imageUrl: '/images/phone 2.png'
    },
    {
        id: 3,
        name: 'Nimbus Edge P9',
        price: 100,
        description: 'Nimbus Edge P9 combines style and substance with a 6.5-inch edge-to-edge display, dual stereo speakers, 64MP triple cameras, and an adaptive battery that intelligently optimizes power consumption.',
        imageUrl: '/images/phone 3.png'
    },
    {
        id: 4,
        name: 'Vortex Titan Z7',
        price: 100,
        description: 'Elevate your mobile experience with Vortex Titan Z7, offering a 7-inch Super AMOLED screen, cutting-edge 5G technology, 50W fast charging, and a pro-grade 48MP camera for stunning clarity in every shot.',
        imageUrl: '/images/phone 2.png'
    }
];

let cart = [];

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// Email setup
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('Error creating email transporter:', error);
    } else {
        console.log('Email transporter created successfully');
    }
});
// Route to display the products
router.get('/', (req, res) => {
    res.render('index', { products, user: req.session.user });
});

// Route to add a product to the cart
router.post('/add-to-cart', isAuthenticated, (req, res) => {
    const productId = parseInt(req.body.productId);
    const product = products.find(p => p.id === productId);
    if (product) {
        cart.push(product);
    }
    res.redirect('/cart');
});

// Route to handle removing items from the cart
router.post('/remove-from-cart', isAuthenticated, (req, res) => {
    const { productId } = req.body;
    cart = cart.filter(product => product.id !== parseInt(productId));
    res.redirect('/cart');
});

// Route to display the cart
router.get('/cart', isAuthenticated, (req, res) => {
    res.render('cart', { cart, products });
});

// Route to display the checkout
router.get('/checkout', isAuthenticated, (req, res) => {
    res.render('checkout', { cart, user: req.session.user });
});

// Route to handle payment with Paystack
router.post('/pay', isAuthenticated, (req, res) => {
    const { email, amount } = req.body;

    const headers = {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    };

    axios.post('https://api.paystack.co/transaction/initialize', {
        email,
        amount: amount * 100,  // Paystack expects the amount in kobo
        callback_url: 'http://localhost:3000/payment/callback'
    }, { headers })
    .then(response => {
        res.redirect(response.data.data.authorization_url);
    })
    .catch(error => {
        console.error(error);
        res.send('An error occurred while initializing payment');
    });
});

// Payment callback route
router.get('/payment/callback', (req, res) => {
    const { reference } = req.query;

    const headers = {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
    };

    axios.get(`https://api.paystack.co/transaction/verify/${reference}`, { headers })
    .then(response => {
        if (response.data.data.status === 'success') {
            const userEmail = req.session.user.email;
            const userName = req.session.user.name;
            const totalAmount = cart.reduce((total, product) => total + product.price, 0);

            // Send email notification
function sendReceiptEmail(userEmail, userName, totalAmount, cart) {
    let productDetails = '';
    cart.forEach(product => {
        productDetails += `\n- ${product.name}: NGN${product.price}\n  Description: ${product.description}\n`;
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Payment Receipt',
        text: `Dear ${userName},\n\nThank you for your purchase! Your payment of NGN${totalAmount} was successful.\n\nYou purchased the following items:${productDetails}\n\nRegards,\nTechAlpha Store`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Email sent: ' + info.response);
    });
}

// Call this function where appropriate, such as after a successful payment
sendReceiptEmail(userEmail, userName, totalAmount, cart);

            // Clear the cart
            cart = [];

            // Redirect to receipt page
            res.redirect(`/receipt?amount=${totalAmount}&reference=${reference}`);
        } else {
            res.send('Payment was not successful');
        }
    })
    .catch(error => {
        console.error(error);
        res.send('An error occurred while verifying payment');
    });
});

// Route to display the receipt page
router.get('/receipt', isAuthenticated, (req, res) => {
    const { amount, reference } = req.query;
    res.render('receipt', { amount, reference, user: req.session.user });
});

// Route to display the registration form
router.get('/register', (req, res) => {
    res.render('register');
});

// Route to handle user registration
router.post('/register', async (req, res) => {
    const { name, email, password, address } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
        name,
        email,
        password: hashedPassword,
        address
    });

    user.save()
        .then(() => res.redirect('/login'))
        .catch(err => res.status(400).send('Error creating user: ' + err));
});

// Route to display the login form
router.get('/login', (req, res) => {
    res.render('login');
});

// Route to handle user login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user;
        res.redirect('/');
    } else {
        res.send('Invalid email or password');
    }
});

// Route to handle user logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

module.exports = router;
