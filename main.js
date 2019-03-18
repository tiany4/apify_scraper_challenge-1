const Apify = require('apify');
const util = require('util');
const fs = require('fs');
const moment = require('moment');

Apify.main(async () => {

    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({url: 'https://www.visithoustontexas.com/event/zumba-in-the-plaza/59011/'}));
    await requestQueue.addRequest(new Apify.Request({url: 'https://www.visithoustontexas.com/events'}));
    // url to grab event until end of 2019
    // https://www.visithoustontexas.com/events/?endDate=12%2F31%2F2019

    const crawler = new Apify.PuppeteerCrawler({
        //maxRequestsPerCrawl: 4,
        requestQueue,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: async ({page, request}) => {

            if (await page.url() === 'https://www.visithoustontexas.com/events/') {
                let file = fs.createWriteStream('events.txt');
                hasNextPage = true;

                while (hasNextPage) {
                    // grab event links into array
                    listOfLinks = await page.evaluate(() => {
                        const tempTitles = Array.from(document.querySelectorAll('.eventItem div.title a'));
                        return tempTitles.map(el => el.href);
                    });

                    // write to file and console
                    file.on('error', function (err) {
                        throw error;
                    });
                    listOfLinks.forEach(async function(link) {
                        file.write(link + '\n');
                        await requestQueue.addRequest(new Apify.Request({url: link}));
                    });
                    console.log(listOfLinks[0]);

                    // check if there are more pages
                    if (await page.$('.sharedPagerContainer a.arrow.next.disabled') === null) {
                        await page.click('.sharedPagerContainer a.arrow.next');
                        // todo: use waitForNavigation instead of band-aid fix
                        await page.waitFor(1500);
                    } else hasNextPage = false;
                }

                file.end();
            } else
                // this is here purely for part 1
                await getEventData({page, request});
        },

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({request}) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();
});

const getEventData = async ({page, request}) => {

    // parse address
    // todo: parse by regex

    let adr = await page.$eval('.adrs', el => el.innerText);
    const adrSplit = adr.split('|');
    const street = adrSplit[0].trim();
    const city = adrSplit[1].trim().substring(0, adrSplit[1].length - 9);
    const state = adrSplit[1].trim().substring(adrSplit[1].length - 9, adrSplit[1].length - 7);
    const zip = adrSplit[1].trim().substring(adrSplit[1].length - 6);

    // parse event details without classes
    // store list of details in an array
    const infoListToParse = await page.evaluate(() => {
        const infoTemp = Array.from(document.querySelectorAll('.detail-c2'));
        return infoTemp.map(infolist => infolist.innerText);
    });
    const infoList = infoListToParse[0].split('\n');

    let contact, times, phone, recurring, admission, date, title, timestamp;
    title = await page.title();
    let titleSplit = title.split('|');
    let description = titleSplit[0].trim();
    timestamp = new Date().toISOString();

    // logic to parse each line
    for (i = 0; i < infoList.length; i++) {
        switch (String(infoList[i].substring(0, infoList[i].indexOf(':')))) {
            case 'Contact':
                contact = infoList[i].substring(infoList[i].indexOf(':') + 2);
                break;
            case 'Phone':
                phone = infoList[i].substring(infoList[i].indexOf(':') + 2);
                break;
            case 'Times':
                times = infoList[i].substring(infoList[i].indexOf(':') + 2);
                break;
            case 'Admission':
                admission = infoList[i].substring(infoList[i].indexOf(':') + 2);
                break;
        }
        if ((infoList[i].substring(0, 9) === "Recurring")) {
            recurring = infoList[i].substring(10);
        }
    }

    // parse date and time with momentjs
    date = await page.$eval('.dates', el => el.innerText);
    let startDate, endDate;
    if (date.includes('-')) {
        const dateSplit = date.split('-');
        startDate = dateSplit[0].trim().replace(',', '');
        endDate = dateSplit[1].trim().replace(',', '');
    } else {
        startDate = date.replace(',', '');
        endDate = startDate;
    }
    if (times != null) {
        const timeSplit = times.split(' to ');
        startDate = moment.parseZone(startDate + ' ' + timeSplit[0], 'MMM DD YYYY hh:mm a').toISOString();
        endDate = moment.parseZone(endDate + ' ' + timeSplit[1], 'MMM DD YYYY hh:mm a').toISOString();
    } else {
        startDate = moment.parseZone(startDate, 'MMM DD YYYY').toISOString();
        endDate = moment.parseZone(endDate, 'MMM DD YYYY').toISOString();
    }

    // save details in an object
    let event = {
        url: await page.url(),
        description: description,
        date: {
            startDate: startDate,
            endDate: endDate
        },
        time: times,
        recurring: recurring,
        place: {
            street: street,
            city: city,
            state: state,
            postal: zip,
        },
        details: {
            contact: contact,
            phone: phone,
            admission: admission,
        },
        timestamp: timestamp
    };

    // Log data (util is a tool that nicely formats objects in the console)
    console.log(util.inspect(event, false, null));

    // save event details to file
    // remove special characters from timestamp
    timestamp = timestamp.replace(/[^\w\s]/g, '_');
    description = description.replace(/[^\w\s]/g, '_');

    let filename = description + timestamp + '.json';
    fs.writeFile(filename, JSON.stringify(event), (err => {
        if (err) throw err;
        console.log('Event is written to ' + description + '.json');
    }));

    // Occasional error: process cannot be terminated; No noticeable bug currently
};