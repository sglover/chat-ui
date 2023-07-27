# Install

Install locally (you will need to have Nodejs and npm):

```
npm install
```

Make sure you have Mongodb running somewhere. For example, to run on your laptop (you will need Docker):

```
docker-compose -f mongo/docker-compose.yaml down -v
docker-compose -f mongo/docker-compose.yaml up -d
```

Create a `.env.local` file in the top level directory with the following contents:

```
MONGODB_URL=mongodb://127.0.0.1:27017
HF_ACCESS_TOKEN=[your Hugging Face Token - optional]
WATSONX_ACCESS_TOKEN=[your Watsonx AI Token]
WATSONX_INFERENCE_API_BASE_URL=[Watsonx base url]
REACT_API_BASE_URL=http://localhost:8000/achat/
PUBLIC_APP_NAME=Telco Service Ordering # name used as title throughout the app
PUBLIC_APP_DESCRIPTION=Natural language chat interface for network services.
```

Run the chat UI locally on your laptop:

```
npm run dev
```

The chat UI will be available at: http://localhost:5173/. Enter the following text in the UI:

```
I want a service in Paris for 4000 users for the following applications: Netflix, Youtube, Apple TV, Amazon Prime, Web browsing. Download throughput should be 50000 and upload throughput should be 10000. The service should consume no more than 14.8 kwh.
```


