const Apify = require('apify');
const util = require('util');
const fs = require('fs');
const moment = require('moment');

Apify.main(async () => {

    // Get queue and enqueue first url.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest(new Apify.Request({ url: 'https://www.visithoustontexas.com/event/zumba-in-the-plaza/59011/' }));

    // Create crawler.
    const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        // This page is executed for each request.
        // If request failes then it's retried 3 times.
        // Parameter page is Puppeteers page object with loaded page.
        handlePageFunction: getEventData,

        // If request failed 4 times then this function is executed.
        handleFailedRequestFunction: async ({ request }) => {
            console.log(`Request ${request.url} failed 4 times`);
        },
    });

    // Run crawler.
    await crawler.run();

});



const getEventData = async ({ page, request }) => {

     // parse address
    // todo: parse by regex

    let adr = await page.$eval('.adrs', el => el.innerText);
    const adrSplit = adr.split('|');
    const street = adrSplit[0].trim();
    const adrSplitTwo = adrSplit[1].split(',');
    const city = adrSplitTwo[0].trim();
    const state = adrSplitTwo[1].trim().substring(0,2);
    const zip = adrSplitTwo[1].trim().substring(adrSplitTwo[1].length-6);

    // parse event details without classes
    // store list of details in an array
    const infoListToParse = await page.evaluate(() => {
        const infoTemp = Array.from(document.querySelectorAll('.detail-c2'));
        return infoTemp.map(infolist => infolist.innerText);
    });
    const infoList = infoListToParse[0].split('\n');

    var contact, times, phone, recurring, admission, date, title, timestamp;
    title = await page.title();
    titleSplit = title.split('|');
    const description = titleSplit[0];
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
    const dateSplit = date.split('-');
    const timeSplit = times.split(' to ');
    let startDate = dateSplit[0].trim().replace(',','');
    let endDate = dateSplit[1].trim().replace(',','');
    startDate = moment.parseZone(startDate + ' ' + timeSplit[0], 'MMM DD YYYY hh:mm a').toISOString();
    endDate = moment.parseZone(endDate + ' ' + timeSplit[1], 'MMM DD YYYY hh:mm a').toISOString();

    // save details in an object
    let event = {
        url:	await page.url(),
        description:	description,
        date:	{
            startDate: startDate,
            endDate: endDate
        },
        time:	times,
        recurring:  recurring,
        place:	{
            street:	street,
            city:	city,
            state:	state,
            postal:	zip,
        },
        details:	{
            contact:	contact,
            phone:	phone,
            admission:	admission,
        },
        timestamp:  timestamp
    };

    // Log data (util is a tool that nicely formats objects in the console)
    console.log(util.inspect(event, false, null));

    // save event details to file
    // remove special characters from timestamp
    timestamp = timestamp.replace(/[^\w\s]/g, '_');

    let filename = description + timestamp + '.json';
    fs.writeFile(filename, JSON.stringify(event), (err => {
        if (err) throw err;
        console.log('Event is written to ' + description + '.json');
    }));

    // Occasional error: process cannot be terminated; No noticeable bug currently

};