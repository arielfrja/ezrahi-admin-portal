\# Super-Admin Organization Management System (Ezrahi Admin Portal)



\*\*System Role:\*\* Tier 0 Super-Admin Management Interface  

\*\*Frontend Architecture:\*\* Angular 18+ (100% Standalone Components) + Angular Material Design 3 (M3)  

\*\*Backend:\*\* Firebase (Authentication, Cloud Firestore, Cloud Functions v2)  

\*\*Primary Objective:\*\* Allow platform owner (Ariel) to authenticate, register new organizations with an initial admin user and license quotas, view/search organizations, and unregister (suspend/delete) them.



\---



\## 1. Architectural Strategy for AI Coding Agents



To prevent common errors produced by medium-tier LLMs:

1\. \*\*Zero NgModules:\*\* Use Angular Standalone Components (`standalone: true`) exclusively.

2\. \*\*Direct Firebase Modular SDK:\*\* Use the official `firebase` modular package (`firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/functions`). Do \*\*not\*\* use `@angular/fire` to eliminate wrapper dependency and version mismatch bugs.

3\. \*\*Explicit Material Imports:\*\* Every component must explicitly import all required Material modules (`MatCardModule`, `MatFormFieldModule`, `MatInputModule`, `MatButtonModule`, `MatTableModule`, `MatDialogModule`, `MatSelectModule`, `MatDatepickerModule`, `MatNativeDateModule`, `MatIconModule`, `MatSnackBarModule`, `MatChipsModule`).

4\. \*\*Soft-Delete Unregistration:\*\* "Unregistering" an organization deactivates its license (`status = "SUSPENDED"`) to avoid orphaned subcollections, with an optional permanent purge option.



\---



\## 2. Global Task Checklist (Execution Order)



```

\[ ] TASK 1: Backend - Firestore Security Rules \& Schema Setup

\[ ] TASK 2: Backend - Cloud Function for Admin User Provisioning

\[ ] TASK 3: Frontend - Angular Project Setup \& Material 3 Theming

\[ ] TASK 4: Frontend - Core Firebase Services \& Auth Guard

\[ ] TASK 5: Frontend - Super-Admin Login View

\[ ] TASK 6: Frontend - Organization Management Dashboard (Table \& Actions)

\[ ] TASK 7: Frontend - Register Organization Modal Dialog (Form \& Validation)

\[ ] TASK 8: Frontend - Unregister / Suspend Confirmation Dialog

```



\---



\## 3. Detailed Step-by-Step Technical Tasks



\---



\### TASK 1: Backend – Firestore Data Schema \& Security Rules



\#### 1.1 Firestore Document Structure

\* \*\*Collection:\*\* `/system\_admins/{uid}`

&#x20; ```typescript

&#x20; {

&#x20;   uid: string;

&#x20;   email: string;

&#x20;   createdAt: Timestamp;

&#x20; }

&#x20; ```

\* \*\*Collection:\*\* `/organizations/{orgId}` (Document ID = manual slug when provided, otherwise Firestore auto-ID)

&#x20; ```typescript

&#x20; {

&#x20;   // No stored orgId field — the Document ID is the single source of truth.

&#x20;   name: string;                // e.g. "בני עקיבא - מחוז מרכז"

&#x20;   createdAt: Timestamp;

&#x20;   orgAdmins: string\[];         // Array of Firebase Auth UIDs

&#x20;   license: {

&#x20;     status: "ACTIVE" | "EXPIRED" | "TRIAL" | "SUSPENDED";

&#x20;     validUntil: Timestamp;

&#x20;     maxActiveEvents: number;   // Maximum concurrent active field events

&#x20;   };

&#x20;   defaults: {

&#x20;     roles: string\[];           // \["manager", "medic", "security", "guide"]

&#x20;     reportTypes: string\[];     // \["MEDICAL", "SECURITY", "DELAY", "HAZARD"]

&#x20;   };

&#x20; }

&#x20; ```



\#### 1.2 Firestore Security Rules (`firestore.rules`)

Configure rules so only verified super-admins can read and write to `/organizations`:

```javascript

rules\_version = '2';

service cloud.firestore {

&#x20; match /databases/{database}/documents {

&#x20;   

&#x20;   function isSuperAdmin() {

&#x20;     return request.auth != null \&\& 

&#x20;       exists(/databases/$(database)/documents/system\_admins/$(request.auth.uid));

&#x20;   }



&#x20;   match /system\_admins/{uid} {

&#x20;     allow read: if request.auth != null \&\& request.auth.uid == uid;

&#x20;     allow write: if false; // Provisioned manually via Firebase Console

&#x20;   }



&#x20;   match /organizations/{orgId} {

&#x20;     allow read, write: if isSuperAdmin();

&#x20;     

&#x20;     match /{allChildren=\*\*} {

&#x20;       allow read, write: if isSuperAdmin();

&#x20;     }

&#x20;   }

&#x20; }

}

```



\---



\### TASK 2: Backend – Cloud Function for Admin User Provisioning



When the Super-Admin creates an organization, an initial Org Admin account must be created in Firebase Authentication without logging out the Super-Admin.



\#### File: `functions/src/index.ts`

```typescript

import \* as functions from "firebase-functions/v2";

import \* as admin from "firebase-admin";



admin.initializeApp();

const db = admin.firestore();

const auth = admin.auth();



interface CreateOrgPayload {

&#x20; orgId?: string; // Optional manual slug; omitted/empty => auto-ID

&#x20; name: string;

&#x20; adminEmail: string;

&#x20; adminPassword?: string;

&#x20; licenseStatus: "ACTIVE" | "TRIAL" | "SUSPENDED";

&#x20; validUntilDate: string; // ISO String

&#x20; maxActiveEvents: number;

}



export const registerOrganization = functions.https.onCall(async (request) => {

&#x20; // 1. Verify caller is Super-Admin

&#x20; const callerUid = request.auth?.uid;

&#x20; if (!callerUid) {

&#x20;   throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");

&#x20; }



&#x20; const superAdminDoc = await db.collection("system\_admins").doc(callerUid).get();

&#x20; if (!superAdminDoc.exists) {

&#x20;   throw new functions.https.HttpsError("permission-denied", "Caller is not a super-admin.");

&#x20; }



&#x20; const data = request.data as CreateOrgPayload;



&#x20; // 2. Validate inputs (orgId is optional — manual slug or auto-ID)

&#x20; if (!data.name || !data.adminEmail) {

&#x20;   throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");

&#x20; }



&#x20; // 3. Resolve the document reference: manual slug or auto-ID

&#x20; let orgRef;

&#x20; let finalOrgId: string;

&#x20; const manualSlug = data.orgId?.trim().toLowerCase();

&#x20; if (manualSlug) {

&#x20;   const cleanOrgId = manualSlug.replace(/\[^a-z0-9\_-]/g, "\_");

&#x20;   const candidateRef = db.collection("organizations").doc(cleanOrgId);

&#x20;   const existingOrg = await candidateRef.get();

&#x20;   if (existingOrg.exists) {

&#x20;     throw new functions.https.HttpsError("already-exists", `Organization ID ${cleanOrgId} already exists.`);

&#x20;   }

&#x20;   orgRef = candidateRef;

&#x20;   finalOrgId = cleanOrgId;

&#x20; } else {

&#x20;   orgRef = db.collection("organizations").doc();

&#x20;   finalOrgId = orgRef.id;

&#x20; }



&#x20; // 4. Create or retrieve Org Admin Auth User

&#x20; let adminUid: string;

&#x20; try {

&#x20;   const existingUser = await auth.getUserByEmail(data.adminEmail);

&#x20;   adminUid = existingUser.uid;

&#x20; } catch (error: any) {

&#x20;   if (error.code === "auth/user-not-found") {

&#x20;     const tempPassword = data.adminPassword || randomBytes(18).toString('base64'); // random; reset-email sent by portal

&#x20;     const newUser = await auth.createUser({

&#x20;       email: data.adminEmail,

&#x20;       password: tempPassword,

&#x20;       displayName: `${data.name} Admin`,

&#x20;     });

&#x20;     adminUid = newUser.uid;

&#x20;   } else {

&#x20;     throw new functions.https.HttpsError("internal", error.message);

&#x20;   }

&#x20; }



&#x20; // 5. Write Organization document to Firestore (no stored orgId field)

&#x20; const newOrg = {

&#x20;   name: data.name,

&#x20;   createdAt: admin.firestore.FieldValue.serverTimestamp(),

&#x20;   orgAdmins: \[adminUid],

&#x20;   license: {

&#x20;     status: data.licenseStatus || "ACTIVE",

&#x20;     validUntil: admin.firestore.Timestamp.fromDate(new Date(data.validUntilDate)),

&#x20;     maxActiveEvents: data.maxActiveEvents || 5,

&#x20;   },

&#x20;   defaults: {

&#x20;     roles: \["manager", "medic", "security", "guide", "tail"],

&#x20;     reportTypes: \["MEDICAL", "SECURITY", "DELAY", "HAZARD", "LOGISTICS"],

&#x20;   },

&#x20; };



&#x20; await orgRef.set(newOrg);



&#x20; return { success: true, orgId: finalOrgId, adminUid };

});

```



\---



\### TASK 3: Frontend – Angular Project Setup \& Material 3 Theming



\#### 3.1 Initialization Commands

```bash

\# Create project with routing and standalone components

npx @angular/cli@18 new ezrahi-admin --routing --style=scss --ssr=false --standalone



cd ezrahi-admin



\# Install Angular Material

npm install @angular/cdk @angular/material



\# Install Firebase SDK

npm install firebase

```



\#### 3.2 Material 3 Theme Configuration (`src/styles.scss`)

```scss

@use '@angular/material' as mat;



html, body {

&#x20; height: 100%;

&#x20; margin: 0;

&#x20; font-family: Roboto, "Helvetica Neue", sans-serif;

&#x20; background-color: #f8fafc;

}



// Enable Material 3 typography and base tokens

@include mat.core();



$theme: mat.define-theme((

&#x20; color: (

&#x20;   theme-type: light,

&#x20;   primary: mat.$azure-palette,

&#x20;   tertiary: mat.$blue-palette,

&#x20; ),

&#x20; typography: (

&#x20;   brand-family: 'Roboto',

&#x20;   plain-family: 'Roboto',

&#x20; ),

&#x20; density: (

&#x20;   scale: 0

&#x20; )

));



:root {

&#x20; @include mat.all-component-themes($theme);

}

```



\---



\### TASK 4: Frontend – Models, Services \& Guard



\#### 4.1 Data Models (`src/app/models/organization.model.ts`)

```typescript

export interface OrganizationLicense {

&#x20; status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED';

&#x20; validUntil: any; // Firebase Timestamp or Date

&#x20; maxActiveEvents: number;

}



export interface Organization {

&#x20; orgId: string; // Firestore Document ID (manual slug or auto-ID), mapped client-side — not stored as a field.

&#x20; name: string;

&#x20; createdAt: any;

&#x20; orgAdmins: string\[];

&#x20; license: OrganizationLicense;

&#x20; defaults?: {

&#x20;   roles: string\[];

&#x20;   reportTypes: string\[];

&#x20; };

}



export interface RegisterOrgRequest {

&#x20; orgId?: string; // Optional manual slug; omitted => backend auto-ID

&#x20; name: string;

&#x20; adminEmail: string;

&#x20; adminPassword?: string;

&#x20; licenseStatus: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';

&#x20; validUntilDate: string; // ISO string

&#x20; maxActiveEvents: number;

}

```



\#### 4.2 Firebase Configuration \& Initialization (`src/environments/environment.ts`)

```typescript

export const environment = {

&#x20; production: false,

&#x20; firebase: {

&#x20;   apiKey: "YOUR\_API\_KEY",

&#x20;   authDomain: "YOUR\_PROJECT\_ID.firebaseapp.com",

&#x20;   projectId: "YOUR\_PROJECT\_ID",

&#x20;   storageBucket: "YOUR\_PROJECT\_ID.appspot.com",

&#x20;   messagingSenderId: "YOUR\_SENDER\_ID",

&#x20;   appId: "YOUR\_APP\_ID"

&#x20; }

};

```



\#### 4.3 Firebase Core Service (`src/app/services/firebase.service.ts`)

```typescript

import { Injectable } from '@angular/core';

import { initializeApp, FirebaseApp } from 'firebase/app';

import { getAuth, Auth } from 'firebase/auth';

import { getFirestore, Firestore } from 'firebase/firestore';

import { getFunctions, Functions } from 'firebase/functions';

import { environment } from '../../environments/environment';



@Injectable({

&#x20; providedIn: 'root'

})

export class FirebaseService {

&#x20; public app: FirebaseApp;

&#x20; public auth: Auth;

&#x20; public firestore: Firestore;

&#x20; public functions: Functions;



&#x20; constructor() {

&#x20;   this.app = initializeApp(environment.firebase);

&#x20;   this.auth = getAuth(this.app);

&#x20;   this.firestore = getFirestore(this.app);

&#x20;   this.functions = getFunctions(this.app);

&#x20; }

}

```



\#### 4.4 Authentication Service (`src/app/services/auth.service.ts`)

```typescript

import { Injectable, signal } from '@angular/core';

import { FirebaseService } from './firebase.service';

import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';

import { doc, getDoc } from 'firebase/firestore';

import { Router } from '@angular/router';



@Injectable({

&#x20; providedIn: 'root'

})

export class AuthService {

&#x20; currentUser = signal<User | null>(null);

&#x20; isSuperAdmin = signal<boolean>(false);

&#x20; isLoading = signal<boolean>(true);



&#x20; constructor(private fb: FirebaseService, private router: Router) {

&#x20;   onAuthStateChanged(this.fb.auth, async (user) => {

&#x20;     this.currentUser.set(user);

&#x20;     if (user) {

&#x20;       // Verify Super-Admin document

&#x20;       const adminRef = doc(this.fb.firestore, 'system\_admins', user.uid);

&#x20;       const adminSnap = await getDoc(adminRef);

&#x20;       this.isSuperAdmin.set(adminSnap.exists());

&#x20;     } else {

&#x20;       this.isSuperAdmin.set(false);

&#x20;     }

&#x20;     this.isLoading.set(false);

&#x20;   });

&#x20; }



&#x20; async login(email: string, pass: string): Promise<void> {

&#x20;   const res = await signInWithEmailAndPassword(this.fb.auth, email, pass);

&#x20;   const adminRef = doc(this.fb.firestore, 'system\_admins', res.user.uid);

&#x20;   const adminSnap = await getDoc(adminRef);

&#x20;   if (!adminSnap.exists()) {

&#x20;     await signOut(this.fb.auth);

&#x20;     throw new Error('Access denied: You are not registered as a Super-Admin.');

&#x20;   }

&#x20; }



&#x20; async logout(): Promise<void> {

&#x20;   await signOut(this.fb.auth);

&#x20;   this.router.navigate(\['/login']);

&#x20; }

}

```



\#### 4.5 Route Guard (`src/app/guards/super-admin.guard.ts`)

```typescript

import { inject } from '@angular/core';

import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';



export const superAdminGuard: CanActivateFn = () => {

&#x20; const authService = inject(AuthService);

&#x20; const router = inject(Router);



&#x20; if (authService.isLoading()) {

&#x20;   // Wait until auth state is resolved

&#x20;   return true;

&#x20; }



&#x20; if (authService.currentUser() \&\& authService.isSuperAdmin()) {

&#x20;   return true;

&#x20; }



&#x20; router.navigate(\['/login']);

&#x20; return false;

};

```



\#### 4.6 Organization Data Service (`src/app/services/organization.service.ts`)

```typescript

import { Injectable } from '@angular/core';

import { FirebaseService } from './firebase.service';

import { collection, collectionData, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';

import { httpsCallable } from 'firebase/functions';

import { Observable } from 'rxjs';

import { Organization, RegisterOrgRequest } from '../models/organization.model';



@Injectable({

&#x20; providedIn: 'root'

})

export class OrganizationService {



&#x20; constructor(private fb: FirebaseService) {}



&#x20; // Real-time stream of all organizations

&#x20; getOrganizations(): Observable<Organization\[]> {

&#x20;   const orgsRef = collection(this.fb.firestore, 'organizations');

&#x20;   return collectionData(orgsRef, { idField: 'orgId' }) as Observable<Organization\[]>;

&#x20; }



&#x20; // Register via Cloud Function (creates Auth Admin user + Firestore doc)

&#x20; async registerOrganization(payload: RegisterOrgRequest): Promise<any> {

&#x20;   const callFunction = httpsCallable(this.fb.functions, 'registerOrganization');

&#x20;   const result = await callFunction(payload);

&#x20;   return result.data;

&#x20; }



&#x20; // Update License / Status (Suspend / Reactivate)

&#x20; async updateLicenseStatus(orgId: string, status: 'ACTIVE' | 'EXPIRED' | 'TRIAL' | 'SUSPENDED'): Promise<void> {

&#x20;   const orgRef = doc(this.fb.firestore, 'organizations', orgId);

&#x20;   await updateDoc(orgRef, {

&#x20;     'license.status': status

&#x20;   });

&#x20; }



&#x20; // Update License Dates or Quotas

&#x20; async updateLicenseDetails(orgId: string, validUntil: Date, maxEvents: number): Promise<void> {

&#x20;   const orgRef = doc(this.fb.firestore, 'organizations', orgId);

&#x20;   await updateDoc(orgRef, {

&#x20;     'license.validUntil': Timestamp.fromDate(validUntil),

&#x20;     'license.maxActiveEvents': maxEvents

&#x20;   });

&#x20; }



&#x20; // Permanent Delete

&#x20; async deleteOrganization(orgId: string): Promise<void> {

&#x20;   const orgRef = doc(this.fb.firestore, 'organizations', orgId);

&#x20;   await deleteDoc(orgRef);

&#x20; }

}

```



\---



\### TASK 5: Frontend – Super-Admin Login Component



\#### 5.1 Logic (`src/app/components/login/login.component.ts`)

```typescript

import { Component, signal } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';



import { MatCardModule } from '@angular/material/card';

import { MatFormFieldModule } from '@angular/material/form-field';

import { MatInputModule } from '@angular/material/input';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';



@Component({

&#x20; selector: 'app-login',

&#x20; standalone: true,

&#x20; imports: \[

&#x20;   CommonModule,

&#x20;   ReactiveFormsModule,

&#x20;   MatCardModule,

&#x20;   MatFormFieldModule,

&#x20;   MatInputModule,

&#x20;   MatButtonModule,

&#x20;   MatIconModule,

&#x20;   MatProgressSpinnerModule

&#x20; ],

&#x20; templateUrl: './login.component.html',

&#x20; styleUrls: \['./login.component.scss']

})

export class LoginComponent {

&#x20; loginForm: FormGroup;

&#x20; errorMessage = signal<string | null>(null);

&#x20; isSubmitting = signal<boolean>(false);



&#x20; constructor(

&#x20;   private fb: FormBuilder,

&#x20;   private auth: AuthService,

&#x20;   private router: Router

&#x20; ) {

&#x20;   this.loginForm = this.fb.group({

&#x20;     email: \['', \[Validators.required, Validators.email]],

&#x20;     password: \['', \[Validators.required, Validators.minLength(6)]]

&#x20;   });

&#x20; }



&#x20; async onSubmit(): Promise<void> {

&#x20;   if (this.loginForm.invalid) return;



&#x20;   this.isSubmitting.set(true);

&#x20;   this.errorMessage.set(null);



&#x20;   const { email, password } = this.loginForm.value;

&#x20;   try {

&#x20;     await this.auth.login(email, password);

&#x20;     this.router.navigate(\['/organizations']);

&#x20;   } catch (err: any) {

&#x20;     this.errorMessage.set(err.message || 'Login failed.');

&#x20;   } finally {

&#x20;     this.isSubmitting.set(false);

&#x20;   }

&#x20; }

}

```



\#### 5.2 Template (`src/app/components/login/login.component.html`)

```html

<div class="login-wrapper">

&#x20; <mat-card class="login-card">

&#x20;   <mat-card-header>

&#x20;     <mat-card-title>Ezrahi Admin</mat-card-title>

&#x20;     <mat-card-subtitle>Super-Admin Portal Login</mat-card-subtitle>

&#x20;   </mat-card-header>



&#x20;   <mat-card-content>

&#x20;     @if (errorMessage()) {

&#x20;       <div class="error-banner">

&#x20;         {{ errorMessage() }}

&#x20;       </div>

&#x20;     }



&#x20;     <form \[formGroup]="loginForm" (ngSubmit)="onSubmit()">

&#x20;       <mat-form-field appearance="outline" class="full-width">

&#x20;         <mat-label>Email</mat-label>

&#x20;         <input matInput formControlName="email" type="email" placeholder="admin@ezrahi.app" />

&#x20;       </mat-form-field>



&#x20;       <mat-form-field appearance="outline" class="full-width">

&#x20;         <mat-label>Password</mat-label>

&#x20;         <input matInput formControlName="password" type="password" />

&#x20;       </mat-form-field>



&#x20;       <button mat-flat-button color="primary" class="full-width submit-btn" \[disabled]="isSubmitting() || loginForm.invalid">

&#x20;         @if (isSubmitting()) {

&#x20;           <mat-spinner diameter="20"></mat-spinner>

&#x20;         } @else {

&#x20;           Sign In

&#x20;         }

&#x20;       </button>

&#x20;     </form>

&#x20;   </mat-card-content>

&#x20; </mat-card>

</div>

```



\#### 5.3 Styles (`src/app/components/login/login.component.scss`)

```scss

.login-wrapper {

&#x20; display: flex;

&#x20; justify-content: center;

&#x20; align-items: center;

&#x20; height: 100vh;

&#x20; background: #f1f5f9;

}



.login-card {

&#x20; width: 100%;

&#x20; max-width: 400px;

&#x20; padding: 1.5rem;

}



.full-width {

&#x20; width: 100%;

&#x20; margin-bottom: 1rem;

}



.error-banner {

&#x20; background-color: #fee2e2;

&#x20; color: #b91c1c;

&#x20; padding: 0.75rem;

&#x20; border-radius: 4px;

&#x20; margin-bottom: 1rem;

&#x20; font-size: 0.875rem;

}



.submit-btn {

&#x20; height: 48px;

&#x20; display: flex;

&#x20; align-items: center;

&#x20; justify-content: center;

}

```



\---



\### TASK 6: Frontend – Organizations List \& Management Dashboard



\#### 6.1 Logic (`src/app/components/org-list/org-list.component.ts`)

```typescript

import { Component, OnInit, signal } from '@angular/core';

import { CommonModule } from '@angular/common';

import { OrganizationService } from '../../services/organization.service';

import { AuthService } from '../../services/auth.service';

import { Organization } from '../../models/organization.model';



import { MatTableModule } from '@angular/material/table';

import { MatButtonModule } from '@angular/material/button';

import { MatIconModule } from '@angular/material/icon';

import { MatChipsModule } from '@angular/material/chips';

import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { MatToolbarModule } from '@angular/material/toolbar';



import { RegisterOrgDialogComponent } from '../register-org-dialog/register-org-dialog.component';

import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';



@Component({

&#x20; selector: 'app-org-list',

&#x20; standalone: true,

&#x20; imports: \[

&#x20;   CommonModule,

&#x20;   MatTableModule,

&#x20;   MatButtonModule,

&#x20;   MatIconModule,

&#x20;   MatChipsModule,

&#x20;   MatDialogModule,

&#x20;   MatSnackBarModule,

&#x20;   MatToolbarModule

&#x20; ],

&#x20; templateUrl: './org-list.component.html',

&#x20; styleUrls: \['./org-list.component.scss']

})

export class OrgListComponent implements OnInit {

&#x20; displayedColumns: string\[] = \['name', 'orgId', 'status', 'validUntil', 'maxEvents', 'actions'];

&#x20; organizations = signal<Organization\[]>(\[]);



&#x20; constructor(

&#x20;   private orgService: OrganizationService,

&#x20;   private auth: AuthService,

&#x20;   private dialog: MatDialog,

&#x20;   private snackBar: MatSnackBar

&#x20; ) {}



&#x20; ngOnInit(): void {

&#x20;   this.orgService.getOrganizations().subscribe({

&#x20;     next: (data) => this.organizations.set(data),

&#x20;     error: (err) => this.snackBar.open('Error loading organizations: ' + err.message, 'Close', { duration: 4000 })

&#x20;   });

&#x20; }



&#x20; openRegisterDialog(): void {

&#x20;   const dialogRef = this.dialog.open(RegisterOrgDialogComponent, {

&#x20;     width: '520px'

&#x20;   });



&#x20;   dialogRef.afterClosed().subscribe((result) => {

&#x20;     if (result) {

&#x20;       this.snackBar.open(`Organization "${result.name}" created successfully.`, 'OK', { duration: 3000 });

&#x20;     }

&#x20;   });

&#x20; }



&#x20; // Toggle Suspend / Reactivate

&#x20; toggleSuspend(org: Organization): void {

&#x20;   const isSuspended = org.license.status === 'SUSPENDED';

&#x20;   const newStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';



&#x20;   const dialogRef = this.dialog.open(ConfirmDialogComponent, {

&#x20;     data: {

&#x20;       title: isSuspended ? 'Reactivate Organization' : 'Suspend Organization',

&#x20;       message: `Are you sure you want to change the status of ${org.name} to ${newStatus}?`

&#x20;     }

&#x20;   });



&#x20;   dialogRef.afterClosed().subscribe(async (confirmed) => {

&#x20;     if (confirmed) {

&#x20;       try {

&#x20;         await this.orgService.updateLicenseStatus(org.orgId, newStatus);

&#x20;         this.snackBar.open(`Organization is now ${newStatus}`, 'OK', { duration: 2500 });

&#x20;       } catch (err: any) {

&#x20;         this.snackBar.open(err.message, 'Close', { duration: 3500 });

&#x20;       }

&#x20;     }

&#x20;   });

&#x20; }



&#x20; // Delete Permanently

&#x20; deleteOrg(org: Organization): void {

&#x20;   const dialogRef = this.dialog.open(ConfirmDialogComponent, {

&#x20;     data: {

&#x20;       title: 'Delete Organization',

&#x20;       message: `Are you sure you want to permanently delete ${org.name} (${org.orgId})? All data will be removed.`

&#x20;     }

&#x20;   });



&#x20;   dialogRef.afterClosed().subscribe(async (confirmed) => {

&#x20;     if (confirmed) {

&#x20;       try {

&#x20;         await this.orgService.deleteOrganization(org.orgId);

&#x20;         this.snackBar.open('Organization deleted successfully', 'OK', { duration: 2500 });

&#x20;       } catch (err: any) {

&#x20;         this.snackBar.open(err.message, 'Close', { duration: 3500 });

&#x20;       }

&#x20;     }

&#x20;   });

&#x20; }



&#x20; formatDate(timestamp: any): string {

&#x20;   if (!timestamp) return 'N/A';

&#x20;   if (timestamp.toDate) {

&#x20;     return timestamp.toDate().toLocaleDateString('he-IL');

&#x20;   }

&#x20;   return new Date(timestamp).toLocaleDateString('he-IL');

&#x20; }



&#x20; logout(): void {

&#x20;   this.auth.logout();

&#x20; }

}

```



\#### 6.2 Template (`src/app/components/org-list/org-list.component.html`)

```html

<mat-toolbar color="primary" class="admin-toolbar">

&#x20; <span>Ezrahi Super-Admin</span>

&#x20; <span class="spacer"></span>

&#x20; <button mat-icon-button (click)="logout()" title="Logout">

&#x20;   <mat-icon>logout</mat-icon>

&#x20; </button>

</mat-toolbar>



<div class="content-container">

&#x20; <div class="header-action-bar">

&#x20;   <div>

&#x20;     <h2>Registered Organizations</h2>

&#x20;     <p class="subtitle">Register, license, and manage platform tenants</p>

&#x20;   </div>

&#x20;   <button mat-flat-button color="primary" (click)="openRegisterDialog()">

&#x20;     <mat-icon>add</mat-icon>

&#x20;     Register Organization

&#x20;   </button>

&#x20; </div>



&#x20; <div class="mat-elevation-z2 table-wrapper">

&#x20;   <table mat-table \[dataSource]="organizations()">



&#x20;     <!-- Name Column -->

&#x20;     <ng-container matColumnDef="name">

&#x20;       <th mat-header-cell \*matHeaderCellDef> Organization Name </th>

&#x20;       <td mat-cell \*matCellDef="let org"> <strong>{{ org.name }}</strong> </td>

&#x20;     </ng-container>



&#x20;     <!-- Org ID Column -->

&#x20;     <ng-container matColumnDef="orgId">

&#x20;       <th mat-header-cell \*matHeaderCellDef> Identifier (Slug) </th>

&#x20;       <td mat-cell \*matCellDef="let org"> <code>{{ org.orgId }}</code> </td>

&#x20;     </ng-container>



&#x20;     <!-- Status Column -->

&#x20;     <ng-container matColumnDef="status">

&#x20;       <th mat-header-cell \*matHeaderCellDef> License Status </th>

&#x20;       <td mat-cell \*matCellDef="let org">

&#x20;         <span class="status-badge" \[ngClass]="org.license?.status">

&#x20;           {{ org.license?.status }}

&#x20;         </span>

&#x20;       </td>

&#x20;     </ng-container>



&#x20;     <!-- Valid Until Column -->

&#x20;     <ng-container matColumnDef="validUntil">

&#x20;       <th mat-header-cell \*matHeaderCellDef> Valid Until </th>

&#x20;       <td mat-cell \*matCellDef="let org"> {{ formatDate(org.license?.validUntil) }} </td>

&#x20;     </ng-container>



&#x20;     <!-- Max Events Column -->

&#x20;     <ng-container matColumnDef="maxEvents">

&#x20;       <th mat-header-cell \*matHeaderCellDef> Concurrency Limit </th>

&#x20;       <td mat-cell \*matCellDef="let org"> {{ org.license?.maxActiveEvents }} Events </td>

&#x20;     </ng-container>



&#x20;     <!-- Actions Column -->

&#x20;     <ng-container matColumnDef="actions">

&#x20;       <th mat-header-cell \*matHeaderCellDef> Actions </th>

&#x20;       <td mat-cell \*matCellDef="let org">

&#x20;         <button mat-icon-button \[color]="org.license?.status === 'SUSPENDED' ? 'primary' : 'warn'"

&#x20;                 (click)="toggleSuspend(org)" 

&#x20;                 \[title]="org.license?.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'">

&#x20;           <mat-icon>{{ org.license?.status === 'SUSPENDED' ? 'play\_circle' : 'pause\_circle' }}</mat-icon>

&#x20;         </button>



&#x20;         <button mat-icon-button color="warn" (click)="deleteOrg(org)" title="Delete Permanently">

&#x20;           <mat-icon>delete\_forever</mat-icon>

&#x20;         </button>

&#x20;       </td>

&#x20;     </ng-container>



&#x20;     <tr mat-header-row \*matHeaderRowDef="displayedColumns"></tr>

&#x20;     <tr mat-row \*matRowDef="let row; columns: displayedColumns;"></tr>

&#x20;   </table>

&#x20; </div>

</div>

```



\#### 6.3 Styles (`src/app/components/org-list/org-list.component.scss`)

```scss

.spacer {

&#x20; flex: 1 1 auto;

}



.content-container {

&#x20; max-width: 1200px;

&#x20; margin: 2rem auto;

&#x20; padding: 0 1rem;

}



.header-action-bar {

&#x20; display: flex;

&#x20; justify-content: space-between;

&#x20; align-items: center;

&#x20; margin-bottom: 1.5rem;



&#x20; h2 {

&#x20;   margin: 0;

&#x20;   font-size: 1.75rem;

&#x20;   font-weight: 500;

&#x20; }



&#x20; .subtitle {

&#x20;   margin: 0;

&#x20;   color: #64748b;

&#x20;   font-size: 0.9rem;

&#x20; }

}



.table-wrapper {

&#x20; border-radius: 8px;

&#x20; overflow: hidden;

&#x20; background: #ffffff;

}



table {

&#x20; width: 100%;

}



.status-badge {

&#x20; padding: 4px 10px;

&#x20; border-radius: 12px;

&#x20; font-size: 0.75rem;

&#x20; font-weight: 600;

&#x20; text-transform: uppercase;



&#x20; \&.ACTIVE {

&#x20;   background-color: #dcfce7;

&#x20;   color: #15803d;

&#x20; }

&#x20; \&.TRIAL {

&#x20;   background-color: #fef9c3;

&#x20;   color: #a16207;

&#x20; }

&#x20; \&.SUSPENDED {

&#x20;   background-color: #fee2e2;

&#x20;   color: #b91c1c;

&#x20; }

&#x20; \&.EXPIRED {

&#x20;   background-color: #f1f5f9;

&#x20;   color: #64748b;

&#x20; }

}

```



\---



\### TASK 7: Frontend – Register Organization Dialog



\#### 7.1 Logic (`src/app/components/register-org-dialog/register-org-dialog.component.ts`)

```typescript

import { Component, signal } from '@angular/core';

import { CommonModule } from '@angular/common';

import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { MatFormFieldModule } from '@angular/material/form-field';

import { MatInputModule } from '@angular/material/input';

import { MatSelectModule } from '@angular/material/select';

import { MatDatepickerModule } from '@angular/material/datepicker';

import { MatNativeDateModule } from '@angular/material/core';

import { MatButtonModule } from '@angular/material/button';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { OrganizationService } from '../../services/organization.service';



@Component({

&#x20; selector: 'app-register-org-dialog',

&#x20; standalone: true,

&#x20; imports: \[

&#x20;   CommonModule,

&#x20;   ReactiveFormsModule,

&#x20;   MatDialogModule,

&#x20;   MatFormFieldModule,

&#x20;   MatInputModule,

&#x20;   MatSelectModule,

&#x20;   MatDatepickerModule,

&#x20;   MatNativeDateModule,

&#x20;   MatButtonModule,

&#x20;   MatProgressSpinnerModule

&#x20; ],

&#x20; templateUrl: './register-org-dialog.component.html',

&#x20; styleUrls: \['./register-org-dialog.component.scss']

})

export class RegisterOrgDialogComponent {

&#x20; orgForm: FormGroup;

&#x20; isSubmitting = signal<boolean>(false);

&#x20; errorMessage = signal<string | null>(null);



&#x20; constructor(

&#x20;   private fb: FormBuilder,

&#x20;   private dialogRef: MatDialogRef<RegisterOrgDialogComponent>,

&#x20;   private orgService: OrganizationService

&#x20; ) {

&#x20;   // Default valid date: 1 year from now

&#x20;   const oneYearFromNow = new Date();

&#x20;   oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);



&#x20;   this.orgForm = this.fb.group({

&#x20;     name: \['', \[Validators.required, Validators.minLength(3)]],

&#x20;     // Optional manual slug; empty => backend auto-generates the doc ID.

&#x20;     orgId: \['', \[Validators.pattern(/^\[a-z0-9\_-]+$/)]],

&#x20;     adminEmail: \['', \[Validators.required, Validators.email]],

&#x20;     adminPassword: \['', \[Validators.minLength(6)]], // optional; empty => random + reset-email

&#x20;     licenseStatus: \['ACTIVE', Validators.required],

&#x20;     validUntilDate: \[oneYearFromNow, Validators.required],

&#x20;     maxActiveEvents: \[5, \[Validators.required, Validators.min(1)]]

&#x20;   });

&#x20; }



&#x20; // Suggest a close alternative when the requested slug is taken (e.g. demo -> demo24332)

&#x20; private suggestId(base: string): string {

&#x20;   const suffix = Math.floor(10000 + Math.random() \* 90000);

&#x20;   return `${base}${suffix}`;

&#x20; }



&#x20; private isAlreadyExists(err: any): boolean {

&#x20;   return err?.code === 'functions/already-exists';

&#x20; }



&#x20; async onSubmit(): Promise<void> {

&#x20;   if (this.orgForm.invalid) return;



&#x20;   this.isSubmitting.set(true);

&#x20;   this.errorMessage.set(null);



&#x20;   const val = this.orgForm.value;

&#x20;   const manualSlug = (val.orgId as string)?.trim() || undefined;

&#x20;   try {

&#x20;     await this.orgService.registerOrganization({

&#x20;       name: val.name,

&#x20;       orgId: manualSlug,

&#x20;       adminEmail: val.adminEmail,

&#x20;       adminPassword: val.adminPassword,

&#x20;       licenseStatus: val.licenseStatus,

&#x20;       validUntilDate: new Date(val.validUntilDate).toISOString(),

&#x20;       maxActiveEvents: val.maxActiveEvents

&#x20;     });



&#x20;     this.dialogRef.close({ name: val.name, orgId: manualSlug ?? '' });

&#x20;   } catch (err: any) {

&#x20;     if (manualSlug && this.isAlreadyExists(err)) {

&#x20;       const suggestion = this.suggestId(manualSlug);

&#x20;       this.orgForm.patchValue({ orgId: suggestion });

&#x20;       this.errorMessage.set('Slug taken — suggested an alternative, edit or submit again.');

&#x20;     } else {

&#x20;       this.errorMessage.set(err.message || 'Failed to create organization');

&#x20;     }

&#x20;   } finally {

&#x20;     this.isSubmitting.set(false);

&#x20;   }

&#x20; }



&#x20; onCancel(): void {

&#x20;   this.dialogRef.close();

&#x20; }

}

```



\#### 7.2 Template (`src/app/components/register-org-dialog/register-org-dialog.component.html`)

```html

<h2 mat-dialog-title>Register New Organization</h2>



<mat-dialog-content>

&#x20; @if (errorMessage()) {

&#x20;   <div class="error-banner">{{ errorMessage() }}</div>

&#x20; }



&#x20; <form \[formGroup]="orgForm" class="dialog-form">

&#x20;   <mat-form-field appearance="outline" class="full-width">

&#x20;     <mat-label>Organization Name</mat-label>

&#x20;     <input matInput formControlName="name" placeholder="e.g. Bnei Akiva Central" />

&#x20;   </mat-form-field>



&#x20;   <mat-form-field appearance="outline" class="full-width">

&#x20;     <mat-label>Identifier (Slug, optional)</mat-label>

&#x20;     <input matInput formControlName="orgId" placeholder="e.g. bnei-akiva" />

&#x20;     <mat-hint>Empty = auto-ID. Otherwise lowercase English, numbers, underscores and hyphens</mat-hint>

&#x20;   </mat-form-field>



&#x20;   <div class="row">

&#x20;     <mat-form-field appearance="outline" class="half-width">

&#x20;       <mat-label>Admin Initial Email</mat-label>

&#x20;       <input matInput formControlName="adminEmail" type="email" placeholder="manager@org.org.il" />

&#x20;     </mat-form-field>



&#x20;     <mat-form-field appearance="outline" class="half-width">

&#x20;       <mat-label>Initial Temp Password</mat-label>

&#x20;       <input matInput formControlName="adminPassword" type="text" />

&#x20;     </mat-form-field>

&#x20;   </div>



&#x20;   <div class="row">

&#x20;     <mat-form-field appearance="outline" class="half-width">

&#x20;       <mat-label>License Status</mat-label>

&#x20;       <mat-select formControlName="licenseStatus">

&#x20;         <mat-option value="ACTIVE">Active</mat-option>

&#x20;         <mat-option value="TRIAL">Trial</mat-option>

&#x20;         <mat-option value="SUSPENDED">Suspended</mat-option>

&#x20;       </mat-select>

&#x20;     </mat-form-field>



&#x20;     <mat-form-field appearance="outline" class="half-width">

&#x20;       <mat-label>Concurrent Event Quota</mat-label>

&#x20;       <input matInput formControlName="maxActiveEvents" type="number" min="1" />

&#x20;     </mat-form-field>

&#x20;   </div>



&#x20;   <mat-form-field appearance="outline" class="full-width">

&#x20;     <mat-label>License Valid Until</mat-label>

&#x20;     <input matInput \[matDatepicker]="picker" formControlName="validUntilDate" />

&#x20;     <mat-datepicker-toggle matIconSuffix \[for]="picker"></mat-datepicker-toggle>

&#x20;     <mat-datepicker #picker></mat-datepicker>

&#x20;   </mat-form-field>

&#x20; </form>

</mat-dialog-content>



<mat-dialog-actions align="end">

&#x20; <button mat-button (click)="onCancel()" \[disabled]="isSubmitting()">Cancel</button>

&#x20; <button mat-flat-button color="primary" (click)="onSubmit()" \[disabled]="orgForm.invalid || isSubmitting()">

&#x20;   @if (isSubmitting()) {

&#x20;     <mat-spinner diameter="20"></mat-spinner>

&#x20;   } @else {

&#x20;     Register

&#x20;   }

&#x20; </button>

</mat-dialog-actions>

```



\#### 7.3 Styles (`src/app/components/register-org-dialog/register-org-dialog.component.scss`)

```scss

.dialog-form {

&#x20; padding-top: 0.5rem;

&#x20; display: flex;

&#x20; flex-direction: column;

}



.full-width {

&#x20; width: 100%;

&#x20; margin-bottom: 0.75rem;

}



.row {

&#x20; display: flex;

&#x20; gap: 1rem;

}



.half-width {

&#x20; flex: 1;

&#x20; margin-bottom: 0.75rem;

}



.error-banner {

&#x20; background-color: #fee2e2;

&#x20; color: #b91c1c;

&#x20; padding: 0.5rem 0.75rem;

&#x20; border-radius: 4px;

&#x20; font-size: 0.85rem;

&#x20; margin-bottom: 1rem;

}

```



\---



\### TASK 8: Frontend – Confirmation Dialog \& Application Routing



\#### 8.1 Confirmation Dialog (`src/app/components/confirm-dialog/confirm-dialog.component.ts`)

```typescript

import { Component, Inject } from '@angular/core';

import { CommonModule } from '@angular/common';

import { MAT\_DIALOG\_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';

import { MatButtonModule } from '@angular/material/button';



export interface ConfirmDialogData {

&#x20; title: string;

&#x20; message: string;

}



@Component({

&#x20; selector: 'app-confirm-dialog',

&#x20; standalone: true,

&#x20; imports: \[CommonModule, MatDialogModule, MatButtonModule],

&#x20; template: `

&#x20;   <h2 mat-dialog-title>{{ data.title }}</h2>

&#x20;   <mat-dialog-content>

&#x20;     <p>{{ data.message }}</p>

&#x20;   </mat-dialog-content>

&#x20;   <mat-dialog-actions align="end">

&#x20;     <button mat-button (click)="onNo()">Cancel</button>

&#x20;     <button mat-flat-button color="warn" (click)="onYes()">Confirm</button>

&#x20;   </mat-dialog-actions>

&#x20; `

})

export class ConfirmDialogComponent {

&#x20; constructor(

&#x20;   public dialogRef: MatDialogRef<ConfirmDialogComponent>,

&#x20;   @Inject(MAT\_DIALOG\_DATA) public data: ConfirmDialogData

&#x20; ) {}



&#x20; onNo(): void {

&#x20;   this.dialogRef.close(false);

&#x20; }



&#x20; onYes(): void {

&#x20;   this.dialogRef.close(true);

&#x20; }

}

```



\#### 8.2 Application Routes (`src/app/app.routes.ts`)

```typescript

import { Routes } from '@angular/router';

import { LoginComponent } from './components/login/login.component';

import { OrgListComponent } from './components/org-list/org-list.component';

import { superAdminGuard } from './guards/super-admin.guard';



export const routes: Routes = \[

&#x20; { path: 'login', component: LoginComponent },

&#x20; { 

&#x20;   path: 'organizations', 

&#x20;   component: OrgListComponent, 

&#x20;   canActivate: \[superAdminGuard] 

&#x20; },

&#x20; { path: '', redirectTo: 'organizations', pathMatch: 'full' },

&#x20; { path: '\*\*', redirectTo: 'organizations' }

];

```



\---



\## 4. Verification \& Testing Protocol for the AI Agent



1\. \*\*Verify Super-Admin Document:\*\* Ensure `/system\_admins/{your-auth-uid}` exists in Cloud Firestore prior to running the app.

2\. \*\*Login Verification:\*\* Navigate to `http://localhost:4200/login`, login with your Super-Admin email and password. Ensure redirection to `/organizations`.

3\. \*\*Register Organization:\*\* Click "Register Organization", enter `name: "Test Youth Movement"`, `slug: "test\_youth"`, admin email, and submit.

&#x20;  \* Verify Cloud Function logs: Check user creation in Firebase Authentication.

&#x20;  \* Verify Firestore: Confirm document at `/organizations/test\_youth` with `license.status: "ACTIVE"`.

4\. \*\*Suspend Organization:\*\* Click the pause icon on `test\_youth`. Confirm status changes to `SUSPENDED` in real-time.

5\. \*\*Delete Organization:\*\* Click the delete icon. Confirm document is permanently removed from Firestore.

