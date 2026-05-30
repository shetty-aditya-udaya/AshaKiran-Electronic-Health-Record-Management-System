# AshaKiran API Reference

Internal documentation for the Flask Backend API.

## Base URL
`/api`

## Authentication
JWT based. Include `Authorization: Bearer <token>` in the headers for all protected routes.

### Login
`POST /login`
- Body: `{"email": "...", "password": "..."}`
- Returns: `{"token": "...", "user": {...}}`

### Register
`POST /register`
- Body: `{"name": "...", "email": "...", "password": "...", "village": "..."}`

## Patients
### Get All Patients
`GET /patients`
- Protected
- Returns array of patient records associated with the logged-in ASHA worker.

### Synchronize Records
`POST /sync`
- Protected
- Body: `{"records": [...]}` (Array of patient objects with `local_id`)
- Returns: `{"pushed": N, "conflicts": M, "status": "success"}`

## Risk Engine
Risk level is calculated based on:
- Age < 18 or > 35 (Pregnancy)
- Missing 3+ vaccinations
- Systolic BP > 140
- Pregnancy weeks > 36
