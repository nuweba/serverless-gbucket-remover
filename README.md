# serverless-gbucket-remover
plugin for serverless to make buckets empty before remove

# Usage
Add to your serverless.yml
```yaml
plugins:
  - serverless-gbucket-remover

custom:
  remover:
     buckets:
       - my-bucket-1
       - my-bucket-2
```

You can specify any number of `bucket`s that you want.

Now you can make all buckets empty by running:
```bash
$ sls gbucketremove
```

# When removing
When removing serverless stack, this plugin automatically make buckets empty  before removing stack.
```sh
$ sls remove
```

