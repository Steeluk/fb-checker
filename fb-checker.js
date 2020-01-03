const PUPPETEER = require('puppeteer');
const CREDS = require('./creds');
const link = "https://www.facebook.com/instantgames/";
const games = { solitaryTripeaks: '755626824646698', mahjongStory: '1869354289823409', solitaireFarm: '2258990194419804', yummyTales: '380684896080764', jewelsBlitz: '363232067418034', triviaQuiz: '365241137646663', cookieCrush: '1920856321568946', candyRain: '226466194579810', candyMatch: '1255697821230772', fishStory: '679085832284772', gardenTales: '243759199843609' };
const exclusions = ['https://platform-lookaside.fbsbx.com/platform/instantgames/profile_pic.jpg']
let error = false;

const fs = require('fs-extra')
const nodemailer = require('nodemailer');

async function run() {
    // Launch browser and go to the first FB game
    const browser = await PUPPETEER.launch({
        headless: false,
        defaultViewport: null,
        //devtools: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-fullscreen', '--disable-web-security', '--disable-site-isolation-trials']
    });
    const context = browser.defaultBrowserContext();
    context.overridePermissions("https://www.facebook.com", ["geolocation", "notifications"]);
    const page = await browser.newPage();
    const gameIds = Object.values(games);
    const gameNames = Object.keys(games);
    await page.goto(link + gameIds[0]);

    // Login into FB
    const USERNAME_SELECTOR = '#email';
    const PASSWORD_SELECTOR = '#pass';
    const BUTTON_SELECTOR = '#loginbutton';

    await page.click(USERNAME_SELECTOR);
    await page.keyboard.type(CREDS.username);

    await page.click(PASSWORD_SELECTOR);
    await page.keyboard.type(CREDS.password);

    await page.click(BUTTON_SELECTOR);

    await page.waitForNavigation();


    // Sign in into email 
    let transport = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'WriteYourOwnEmailAddress',
            pass: 'WriteYourOwnPassword'
        }
    });

    // Get errors from the console
    let i = 0;
    let newErrors = '';
    let oldErrors = '';
    page.on('console', msg => {
        if (msg.type() == 'error') {
            // If errors are not part of our exclusions
            if (!exclusions.some(exclusion => msg.location().url.includes(exclusion))) {
                fs.access('errors/' + gameNames[i] + '.txt', fs.F_OK, (err) => {
                    if (err) {
                        // If no previous errors' file exists then create it and add new errors
                        newErrors += 'An error in ' + gameNames[i] + ' has been found: ' + msg.text() + '  ||  ' + msg.location().url + ':' + msg.location().lineNumber + '\n';
                        error = true;
                        return;
                    }
                    // Otherwise check from the previous errors' file if the error is old or new
                    fs.readFile('errors/' + gameNames[i] + '.txt', function (err, data) {
                        if (err) throw err;
                        if (!data.includes(msg.text() + '  ||  ' + msg.location().url + ':' + msg.location().lineNumber)) {
                            newErrors += 'An error in ' + gameNames[i] + ' has been found: ' + msg.text() + '  ||  ' + msg.location().url + ':' + msg.location().lineNumber + '\n';
                            error = true;
                        }
                        else
                            oldErrors += 'An error in ' + gameNames[i] + ' has been found: ' + msg.text() + '  ||  ' + msg.location().url + ':' + msg.location().lineNumber + '\n';
                    });
                });

            }
        }
    });

    // Create a new 'errors' folder if it doesn't exist
    fs.ensureDir('errors', err => { })

    let mailTxt = '';
    let allErrors = '';
    // For every game
    while (i < gameIds.length) {
        // Go to the game
        await page.goto(link + gameIds[i]);
        // Wait until loading
        await page.waitFor(4000);
        // If there's some new error...
        if (error) {
            if (oldErrors) {
                mailTxt = 'New errors:\n' + newErrors + '\n\nOld errors:\n' + oldErrors;
                allErrors = oldErrors + '\n' + newErrors;
            }
            else {
                mailTxt = 'New errors:\n' + newErrors;
                allErrors = newErrors;
            }
            try {
                //Create or overwrite errors' file with all current errors
                const data = fs.writeFileSync('errors/' + gameNames[i] + '.txt', allErrors);
                // Send an email with all new and old errors and a screenshot attached 
                await page.screenshot({ path: 'error.png' });
                const message = {
                    from: 'victor.reviejo@softgames.de', // Sender address
                    to: 'victor.reviejo@softgames.de',         // List of recipients
                    subject: 'Error found in ' + gameNames[i], // Subject line
                    text: mailTxt,
                    attachments: [
                        { // Use a URL as an attachment
                            filename: gameNames[i] + '-error.png',
                            path: 'error.png'
                        }
                    ]
                };
                transport.sendMail(message, function (err, info) {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(info);
                    }
                });
            } catch (err) {
                console.error(err)
            }
            error = false;
        }
        await page.waitFor(1000);
        mailTxt = '';
        allErrors = '';
        newErrors = '';
        oldErrors = '';
        i++;
    }
    console.log("Test finished!!");
    browser.close();
}

run();