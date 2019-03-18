const Apify = require('apify');
const util = require('util');

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

    const infoListToParse = await page.evaluate(() => {
        const infoTemp = Array.from(document.querySelectorAll('.detail-c2'));
        return infoTemp.map(infolist => infolist.innerText);
    });
    const infoList = infoListToParse[0].split('\n');

    var contact, times, phone, recurring, admission;

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

    let event = {
        url:	await page.url(),
        description:	await page.title(),
        date:	await page.$eval('.dates', el => el.innerText),
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
        timestamp:  new Date()
    };

    // Occasional error: process cannot be terminated; No noticeable bug currently
    // Log data (util is a tool that nicely formats objects in the console)
    console.log(util.inspect(event, false, null));
};