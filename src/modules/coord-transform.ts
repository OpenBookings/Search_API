export async function coordTransform(lat: number, lon: number) {
        
        const apiKey = process.env.MAPS_API_KEY;
        if (!apiKey) {
            throw new Error("MAPS_API_KEY is not defined in environment variables");
        }
    
        // Properly inject API key into the URL
        const url = `https://geocode.maps.co/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&api_key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Reverse geocode request failed: ${response.status} ${response.statusText}`);
        }
    
        const data = await response.json();
        const location = data.address.city + ', ' + data.address.country;
        return location;
}