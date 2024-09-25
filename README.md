# Gallery API

## google cloud setup

### create artifact repository

```bash
gcloud services enable artifactregistry.googleapis.com
gcloud artifacts repositories create zinovik-repository --location=europe-central2 --repository-format=docker
```

### create scheduler

```bash
gcloud scheduler jobs create http gallery-update-sources-config --location=europe-central2 --schedule="0 0 * * 1" --uri="https://gallery-api-306312319198.europe-central2.run.app/edit/update-sources-config" --oidc-service-account-email=gallery@zinovik-project.iam.gserviceaccount.com --http-method=post

gcloud scheduler jobs create http gallery-update-file-accesses --location=europe-central2 --schedule="55 23 * * 0" --uri="https://gallery-api-306312319198.europe-central2.run.app/edit/update-file-accesses" --oidc-service-account-email=gallery@zinovik-project.iam.gserviceaccount.com --http-method=post
```

### create service account

```bash
gcloud iam service-accounts create github-actions
gcloud iam service-accounts create gallery
```

### add roles (`Service Account User`, `Cloud Build Service Account` and `Viewer`) to the service account you want to use to deploy the cloud run

```bash
gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:github-actions@zinovik-project.iam.gserviceaccount.com" --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:github-actions@zinovik-project.iam.gserviceaccount.com" --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:github-actions@zinovik-project.iam.gserviceaccount.com" --role="roles/viewer"
```

### creating keys for service account for github-actions `GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY_FILE`

```bash
gcloud iam service-accounts keys create key-file.json --iam-account=github-actions@appspot.gserviceaccount.com
cat key-file.json | base64
```

### add access to secrets, bucket and cloud run invoking

```
gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:gallery@zinovik-project.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:gallery@zinovik-project.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"

gcloud storage buckets add-iam-policy-binding gs://zinovik-gallery --member="serviceAccount:gallery@zinovik-project.iam.gserviceaccount.com" --role="roles/storage.admin"

gcloud projects add-iam-policy-binding zinovik-project --member="serviceAccount:gallery@zinovik-project.iam.gserviceaccount.com" --role="roles/run.invoker"
```

### add secrets

```
printf "JWT_SECRET" | gcloud secrets create gallery-api-jwt-secret --locations=europe-central2 --replication-policy="user-managed" --data-file=-
```
