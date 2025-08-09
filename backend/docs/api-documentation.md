# SalesBase API Documentation

This document provides comprehensive documentation for the SalesBase API endpoints.

## Authentication

All API requests (except authentication endpoints) require a JWT token.

### Obtaining a token

**POST /api/auth/login**

Request:

```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

Response:

```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Using the token

Include the token in all API requests as an Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Endpoints

### Users

#### Get All Users

**GET /api/users**

Response:

```json
{
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "firstName": "Admin",
      "lastName": "User",
      "role": "admin",
      "isActive": true
    },
    {
      "id": 2,
      "email": "sales@example.com",
      "firstName": "Sales",
      "lastName": "User",
      "role": "sales",
      "isActive": true
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pageSize": 20,
    "pages": 1
  }
}
```

#### Get User

**GET /api/users/:id**

Response:

```json
{
  "id": 1,
  "email": "admin@example.com",
  "firstName": "Admin",
  "lastName": "User",
  "role": "admin",
  "isActive": true,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

#### Create User

**POST /api/users**

Request:

```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "firstName": "New",
  "lastName": "User",
  "role": "sales"
}
```

Response:

```json
{
  "id": 3,
  "email": "newuser@example.com",
  "firstName": "New",
  "lastName": "User",
  "role": "sales",
  "isActive": true,
  "createdAt": "2023-10-18T00:00:00.000Z"
}
```

#### Update User

**PUT /api/users/:id**

Request:

```json
{
  "firstName": "Updated",
  "lastName": "Name",
  "role": "manager"
}
```

Response:

```json
{
  "id": 3,
  "email": "newuser@example.com",
  "firstName": "Updated",
  "lastName": "Name",
  "role": "manager",
  "isActive": true,
  "updatedAt": "2023-10-18T01:00:00.000Z"
}
```

#### Delete User

**DELETE /api/users/:id**

Response:

```json
{
  "message": "User deleted successfully"
}
```

### Leads

#### Get All Leads

**GET /api/leads**

Response:

```json
{
  "data": [
    {
      "id": 1,
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@example.com",
      "phone": "123-456-7890",
      "status": "NEW",
      "company": "ABC Corp",
      "assignedTo": 2,
      "createdAt": "2023-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "pages": 1
  }
}
```

#### Get Lead

**GET /api/leads/:id**

Response:

```json
{
  "id": 1,
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@example.com",
  "phone": "123-456-7890",
  "status": "NEW",
  "company": "ABC Corp",
  "industry": "Technology",
  "source": "Website",
  "notes": "Initial contact via contact form",
  "assignedTo": 2,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

#### Create Lead

**POST /api/leads**

Request:

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "987-654-3210",
  "company": "XYZ Ltd",
  "status": "NEW",
  "industry": "Healthcare",
  "source": "Referral"
}
```

Response:

```json
{
  "id": 2,
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "987-654-3210",
  "company": "XYZ Ltd",
  "status": "NEW",
  "industry": "Healthcare",
  "source": "Referral",
  "assignedTo": 1,
  "createdAt": "2023-10-18T00:00:00.000Z"
}
```

### Deals

#### Get All Deals

**GET /api/deals**

Response:

```json
{
  "data": [
    {
      "id": 1,
      "title": "Enterprise License",
      "value": 50000,
      "stage": "PROPOSAL",
      "customerId": 1,
      "customerName": "ABC Corp",
      "assignedTo": 2,
      "closingDate": "2023-12-31T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "pageSize": 20,
    "pages": 1
  }
}
```

### Audit Logs

#### Get All Audit Logs (Admin/Manager Only)

**GET /api/audit**

Response:

```json
{
  "logs": [
    {
      "id": 1,
      "userId": 1,
      "action": "CREATE",
      "entityType": "lead",
      "entityId": 2,
      "details": {
        "requestBody": {
          "firstName": "Jane",
          "lastName": "Doe"
        }
      },
      "ipAddress": "192.168.1.1",
      "createdAt": "2023-10-18T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

#### Get Entity Audit Logs

**GET /api/audit/entity/:entityType/:entityId**

Response:

```json
[
  {
    "id": 1,
    "userId": 1,
    "action": "CREATE",
    "entityType": "lead",
    "entityId": 2,
    "details": {
      "requestBody": {
        "firstName": "Jane",
        "lastName": "Doe"
      }
    },
    "ipAddress": "192.168.1.1",
    "createdAt": "2023-10-18T00:00:00.000Z"
  },
  {
    "id": 2,
    "userId": 1,
    "action": "UPDATE",
    "entityType": "lead",
    "entityId": 2,
    "details": {
      "requestBody": {
        "status": "CONTACTED"
      }
    },
    "ipAddress": "192.168.1.1",
    "createdAt": "2023-10-18T01:00:00.000Z"
  }
]
```

#### Get My Activity

**GET /api/audit/my-activity**

Response:

```json
{
  "logs": [
    {
      "id": 1,
      "userId": 1,
      "action": "CREATE",
      "entityType": "lead",
      "entityId": 2,
      "details": {
        "requestBody": {
          "firstName": "Jane",
          "lastName": "Doe"
        }
      },
      "ipAddress": "192.168.1.1",
      "createdAt": "2023-10-18T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

## Error Responses

All API endpoints return appropriate HTTP status codes:

- `200 OK` - The request succeeded
- `201 Created` - A new resource was created
- `400 Bad Request` - The request was invalid
- `401 Unauthorized` - Authentication is required
- `403 Forbidden` - The user doesn't have permission
- `404 Not Found` - The resource was not found
- `500 Internal Server Error` - Server error

Error response format:

```json
{
  "error": "Error message",
  "details": {} // Optional additional details
}
```

## Rate Limiting

API requests are limited to 100 requests per 15-minute window per IP address. When the limit is exceeded, a `429 Too Many Requests` status code is returned.
