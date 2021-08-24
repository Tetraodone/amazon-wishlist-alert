const cheerio = require("cheerio");
const axios = require("axios");

var oldList;

let whatever = 'https://api.allorigins.win/get?url=';
let base = "https://www.amazon.com"
//TODO: Add support for other amazon stores; .uk etc.
let baseUrl = "https://www.amazon.com/hz/wishlist/slv/items?filter=unpurchased&itemsLayout=GRID&sort=default&type=wishlist&lid=";

const timer = ms => new Promise(res => setTimeout(res, ms));

class Item {
    name;
    image;
    href;
    constructor(name, image, href){
        this.name = name;
        this.image = image;
        this.href = href;
    }
}

function constructItems(items){
    var constructedItems = [];

    for(let item of items){
        var imgUrl = "";
        for (const [key, value] of Object.entries(item.parent.children)) {
            try{
                if(value.attribs.class.includes("wl-grid-item-middle-section")){
                    for (const [nkey, nvalue] of Object.entries(value.children)) {
                        if(nvalue.type == "tag"){
                            imgUrl = nvalue.attribs.src;
                        }
                    }
                }
            } catch {}
        }
        constructedItems.push(new Item(item.attribs.title, imgUrl, item.attribs.href));
    }

    return constructedItems;

}

async function failSafeFetch(url){
    try{
        //meta tag to avoid recieving cached version
        const {data} = await axios.get(whatever + encodeURIComponent(url + `&meta=${makeid(10)}`));
        return data;
    } catch (error) {
        if(error.response.status == 502){
            return failSafeFetch(url);
        } else {
            return null;
        }
    }
}

async function nextPage(url){
    const data = await failSafeFetch(`${base}${url}`);
    const $ = cheerio.load(data.contents);
    const items = $('.wl-image-overlay');
    const more = $(".wl-see-more");

    return {items: constructItems(items), navigation: more};
}

async function scrapeList(id) {
    console.log(`Scraping: ${id}`);
    try {
        fetching = true;
        //const {data} = await axios.get(whatever + encodeURIComponent(`${baseUrl}${id}&ajax=false`));
        const data = await failSafeFetch(`${baseUrl}${id}&ajax=false`);
        if(data == null){
            return null;
        }
        const $ = cheerio.load(data.contents);
        var items = [];
        
        var itemData = $('.wl-image-overlay');
        items = items.concat(constructItems(itemData));
        console.log('\x1b[2m%s\x1b[0m', `Scraped first ${items.length} items`)

        var more = $(".wl-see-more");

        var endOfList = (items.length < 12);

        while(!endOfList){
            await timer(2000);
            try {
                const page = await nextPage(more[0].attribs.href);
                console.log('\x1b[2m%s\x1b[0m', `Scraped ${page.items.length} more items`);
                
                endOfList = (page.items.length < 12)

                if(!endOfList){
                    more = page.navigation;
                }
                
            } catch  (error) {
                console.log('\x1b[4m%s\x1b[0m', 'Could not get next page, trying again..')
            }
        }

        fetching = false;
        return items;
    } catch (error) {
        console.warn(error);
    }

    return null;
}

async function verifyItem(item){
    //Check that the product has not been removed from sale
    async function tryGet() {
        const data = await failSafeFetch(`${base}${item.href}`);
        const $ = cheerio.load(data.contents);
        let title = $("#productTitle");
    }

    try{
        await tryGet();
        return true;
    } catch (error) {
        //503 Error due to Amazon Secuirity, try again
        if(error.response.status == 503){
            return await verifyItem(item);
        }
    }
}

async function check(list){
    let newList = await scrapeList(list);
    console.log('\x1b[2m%s\x1b[0m', "Comparing lists");
    if(newList != null){
        console.log('\x1b[2m%s\x1b[0m', `New list has ${newList.length}, Old list has ${oldList.length}`);
        if(newList.length < oldList.length){
            //Something has been purchased or removed from list
            //Unfortunately I don't know of a way to determine if the product was purchased or removed
            var removedItems = [];
            var filtered = newList;
            for(let item of oldList){
                let oldCount = filtered.length;
                filtered = filtered.filter(_item => _item.name != item.name);
                if(filtered.length == oldCount){
                    //this item has been removed
                    if(await verifyItem(item)){
                        //Item has not been removed from sale
                        removedItems.push(item);
                    }
                    
                }
            }
    
            for (let item of removedItems){
                console.log('\x1b[1m%s\x1b[0m', `Someone has purchased ${item.name.slice(0, 21)}! Thank you!`);
            }
            const purchasedEvent = new CustomEvent('productsPurchased', {detail: removedItems});
            window.dispatchEvent(purchasedEvent);
        }
        oldList = newList;
    } else {
        console.log('\x1b[32m%s\x1b[0m', 'Could not build list due to Amazon limitations... Will try again in 120s.');
    }
    
}

async function setup(listId){
    console.log('\x1b[32m%s\x1b[0m', "Starting...");
    oldList = await scrapeList(listId);
    if(oldList != null){
        console.log("Succsessfuly got list. Will check list every 120 seconds.");
        setInterval(check, 120000, listId);
    } else {
        console.warn("Could not get any list, Ending...")
    }
}

function makeid(length) {
    var result           = '';
    var characters       = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}

module.exports = function(listId){return setup(listId);}



