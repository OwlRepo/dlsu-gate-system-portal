### Building and running your application

To build and run your application, use the following command:

```sh
docker-compose up --build
```

Your application will be available at [http://localhost:3000](http://localhost:3000).

### Deploying your application to the cloud

First, build your image:

```sh
docker build -t myapp .
```

If your cloud provider uses a different CPU architecture than your development machine (e.g., you are on a Mac M1 and your cloud provider uses amd64), build the image for that platform:

```sh
docker build --platform=linux/amd64 -t myapp .
```

Then, push it to your registry:

```sh
docker push myregistry.com/myapp
```

Consult Docker's [getting started](https://docs.docker.com/go/get-started-sharing/) documentation for more details on building and pushing images.

### References

- [Docker's Node.js guide](https://docs.docker.com/language/nodejs/)
