import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Read firebase-applet-config.json to extract the correct database configuration
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error('Failed to parse firebase-applet-config.json', e);
}

// Initialize firebase-admin SDK
let app: App;
if (getApps().length === 0) {
  app = initializeApp({
    projectId: firebaseConfig.projectId
  });
} else {
  app = getApps()[0];
}

const dbId = firebaseConfig.firestoreDatabaseId;
const firestore = dbId && dbId !== '(default)' 
  ? getFirestore(app, dbId) 
  : getFirestore(app);

// Types for data models
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  usageCount: number;
  isSubscribed: boolean;
  subscriptionType: 'none' | 'monthly' | 'yearly';
  createdAt: string;
  facebookApiKey?: string;
  googleAdsApiKey?: string;
  imageGenApiKey?: string;
  videoGenApiKey?: string;
  phoneNumber?: string;
  signupMethod?: 'google' | 'phone' | 'email';
  signupSource?: string;
  signupMedium?: string;
  signupCampaign?: string;
}

export type SignupDetails = Pick<User, 'phoneNumber' | 'signupMethod' | 'signupSource' | 'signupMedium' | 'signupCampaign'>;

export interface PlatformConfig {
  facebookApiKey: string;
  googleAdsApiKey: string;
  paymentApiKey: string;
  updatedAt: string;
}

export interface SystemLog {
  id: string;
  userId?: string;
  userEmail?: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface Consultation {
  id: string;
  userId: string;
  userEmail: string;
  query: string;
  response: string;
  category: string;
  timestamp: string;
}

export interface VoiceCommand {
  id: string;
  userId: string;
  userEmail: string;
  transcript: string;
  executedAction?: string;
  responseSpoken?: string;
  timestamp: string;
}

const DEFAULT_CONFIG: PlatformConfig = {
  facebookApiKey: '',
  googleAdsApiKey: '',
  paymentApiKey: '',
  updatedAt: new Date().toISOString()
};

// Seed administrative user details
// The admin account is configured from the environment. The repository used to
// ship a fixed default password; that password is now refused at login
// (see LEGACY_DEFAULT_ADMIN_HASH in server.ts). Without ADMIN_PASSWORD set, the
// seeded admin gets a random password nobody knows, so it cannot be used to sign in.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@sarthavaha.com').toLowerCase();
const ADMIN_PASSWORD_HASH = crypto
  .createHash('sha256')
  .update(process.env.ADMIN_PASSWORD || crypto.randomBytes(32).toString('hex'))
  .digest('hex');

const localDbPath = path.join(process.cwd(), 'data.json');

interface LocalDbData {
  users: Record<string, User>;
  config: PlatformConfig;
  logs: SystemLog[];
  consultations?: Record<string, Consultation>;
  voiceCommands?: Record<string, VoiceCommand>;
}

function readLocalDb(): LocalDbData {
  try {
    if (fs.existsSync(localDbPath)) {
      const data = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
      if (!data.consultations) data.consultations = {};
      if (!data.voiceCommands) data.voiceCommands = {};
      return data;
    }
  } catch (e) {
    console.error('Failed to read local DB file', e);
  }
  return {
    users: {},
    config: {
      facebookApiKey: '',
      googleAdsApiKey: '',
      paymentApiKey: '',
      updatedAt: new Date().toISOString()
    },
    logs: [],
    consultations: {},
    voiceCommands: {}
  };
}

function writeLocalDb(data: LocalDbData) {
  try {
    fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write local DB file', e);
  }
}

class Database {
  private useLocalFallback = false;
  private usersColl = firestore.collection('users');
  private configColl = firestore.collection('config');
  private logsColl = firestore.collection('logs');
  private consultationsColl = firestore.collection('consultations');
  private voiceCommandsColl = firestore.collection('voiceCommands');

  constructor() {
    this.seedAdmin().catch(err => {
      console.error('Failed to seed admin in Firestore', err);
    });
  }

  private async execute<T>(
    firestoreOp: () => Promise<T>,
    localFallbackOp: () => T | Promise<T>
  ): Promise<T> {
    if (this.useLocalFallback) {
      return await localFallbackOp();
    }
    try {
      return await firestoreOp();
    } catch (err: any) {
      const errMsg = err.message || '';
      if (
        errMsg.includes('permission') || 
        errMsg.includes('PERMISSION_DENIED') || 
        err.code === 7
      ) {
        console.warn('Firestore operation failed with permission error. Falling back to local JSON database.');
        this.useLocalFallback = true;
        return await localFallbackOp();
      }
      throw err;
    }
  }

  private async seedAdmin(): Promise<void> {
    const adminId = 'admin-user-id';
    
    await this.execute(
      async () => {
        const adminDoc = await this.usersColl.doc(adminId).get();
        if (!adminDoc.exists) {
          const adminUser: User = {
            id: adminId,
            email: ADMIN_EMAIL,
            passwordHash: ADMIN_PASSWORD_HASH,
            role: 'admin',
            usageCount: 0,
            isSubscribed: true,
            subscriptionType: 'yearly',
            createdAt: new Date().toISOString()
          };
          await this.usersColl.doc(adminId).set(adminUser);
          await this.addLog(adminId, 'Admin user seeded', `Admin user registered under ${ADMIN_EMAIL}`);
          console.log('Seeded administrator account in Firestore.');
        }
      },
      async () => {
        const data = readLocalDb();
        if (!data.users[adminId]) {
          const adminUser: User = {
            id: adminId,
            email: ADMIN_EMAIL,
            passwordHash: ADMIN_PASSWORD_HASH,
            role: 'admin',
            usageCount: 0,
            isSubscribed: true,
            subscriptionType: 'yearly',
            createdAt: new Date().toISOString()
          };
          data.users[adminId] = adminUser;
          
          // Add admin log to local
          const logId = crypto.randomUUID();
          const log: SystemLog = {
            id: logId,
            userId: adminId,
            userEmail: ADMIN_EMAIL,
            action: 'Admin user seeded',
            details: `Admin user registered under ${ADMIN_EMAIL}`,
            timestamp: new Date().toISOString()
          };
          data.logs.unshift(log);
          
          writeLocalDb(data);
          console.log('Seeded administrator account in local database file.');
        }
      }
    );
  }

  public async getUsers(): Promise<User[]> {
    return this.execute(
      async () => {
        const snapshot = await this.usersColl.get();
        const list: User[] = [];
        snapshot.forEach(doc => {
          list.push(doc.data() as User);
        });
        return list;
      },
      async () => {
        const data = readLocalDb();
        return Object.values(data.users);
      }
    );
  }

  public async getUserById(id: string): Promise<User | undefined> {
    return this.execute(
      async () => {
        const doc = await this.usersColl.doc(id).get();
        if (!doc.exists) return undefined;
        return doc.data() as User;
      },
      async () => {
        const data = readLocalDb();
        return data.users[id];
      }
    );
  }

  public async getUserByEmail(email: string): Promise<User | undefined> {
    const lowerEmail = email.toLowerCase();
    return this.execute(
      async () => {
        const snapshot = await this.usersColl.where('email', '==', lowerEmail).limit(1).get();
        if (snapshot.empty) return undefined;
        return snapshot.docs[0].data() as User;
      },
      async () => {
        const data = readLocalDb();
        return Object.values(data.users).find(u => u.email.toLowerCase() === lowerEmail);
      }
    );
  }

  public async createUser(email: string, passwordHash: string, role: 'admin' | 'user' = 'user'): Promise<User> {
    const id = crypto.randomUUID();
    const newUser: User = {
      id,
      email: email.toLowerCase(),
      passwordHash,
      role,
      usageCount: 0,
      isSubscribed: false,
      subscriptionType: 'none',
      createdAt: new Date().toISOString()
    };

    return this.execute(
      async () => {
        await this.usersColl.doc(id).set(newUser);
        await this.addLog(id, 'User Registered', `Account created for ${email}`);
        return newUser;
      },
      async () => {
        const data = readLocalDb();
        data.users[id] = newUser;
        
        // Add register log to local
        const logId = crypto.randomUUID();
        const log: SystemLog = {
          id: logId,
          userId: id,
          userEmail: newUser.email,
          action: 'User Registered',
          details: `Account created for ${email}`,
          timestamp: new Date().toISOString()
        };
        data.logs.unshift(log);
        
        writeLocalDb(data);
        return newUser;
      }
    );
  }

  public async createUserWithId(id: string, email: string, role: 'admin' | 'user' = 'user', details: SignupDetails = {}): Promise<User> {
    // Firestore rejects undefined values, so only copy the details that are set.
    const extras = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== '')) as SignupDetails;
    const newUser: User = {
      id,
      email: email.toLowerCase(),
      passwordHash: '',
      role,
      usageCount: 0,
      isSubscribed: false,
      subscriptionType: 'none',
      createdAt: new Date().toISOString(),
      ...extras
    };

    return this.execute(
      async () => {
        await this.usersColl.doc(id).set(newUser);
        await this.addLog(id, 'User Registered via Firebase', `Account created for ${email}`);
        return newUser;
      },
      async () => {
        const data = readLocalDb();
        data.users[id] = newUser;
        
        // Add register log to local
        const logId = crypto.randomUUID();
        const log: SystemLog = {
          id: logId,
          userId: id,
          userEmail: newUser.email,
          action: 'User Registered via Firebase',
          details: `Account created for ${email}`,
          timestamp: new Date().toISOString()
        };
        data.logs.unshift(log);
        
        writeLocalDb(data);
        return newUser;
      }
    );
  }

  public async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'email' | 'createdAt'>>): Promise<User | undefined> {
    return this.execute(
      async () => {
        const userDoc = this.usersColl.doc(id);
        const doc = await userDoc.get();
        if (!doc.exists) return undefined;
        
        await userDoc.update(updates);
        const updatedDoc = await userDoc.get();
        return updatedDoc.data() as User;
      },
      async () => {
        const data = readLocalDb();
        const user = data.users[id];
        if (!user) return undefined;
        
        const updatedUser = {
          ...user,
          ...updates
        };
        data.users[id] = updatedUser;
        writeLocalDb(data);
        return updatedUser;
      }
    );
  }

  public async getConfig(): Promise<PlatformConfig> {
    return this.execute(
      async () => {
        const doc = await this.configColl.doc('global').get();
        if (!doc.exists) {
          await this.configColl.doc('global').set(DEFAULT_CONFIG);
          return DEFAULT_CONFIG;
        }
        return doc.data() as PlatformConfig;
      },
      async () => {
        const data = readLocalDb();
        return data.config || DEFAULT_CONFIG;
      }
    );
  }

  public async updateConfig(config: Partial<PlatformConfig>): Promise<PlatformConfig> {
    return this.execute(
      async () => {
        const docRef = this.configColl.doc('global');
        const doc = await docRef.get();
        
        let currentConfig = DEFAULT_CONFIG;
        if (doc.exists) {
          currentConfig = doc.data() as PlatformConfig;
        }

        const updated = {
          ...currentConfig,
          ...config,
          updatedAt: new Date().toISOString()
        };

        await docRef.set(updated);
        return updated;
      },
      async () => {
        const data = readLocalDb();
        const currentConfig = data.config || DEFAULT_CONFIG;
        const updated = {
          ...currentConfig,
          ...config,
          updatedAt: new Date().toISOString()
        };
        data.config = updated;
        writeLocalDb(data);
        return updated;
      }
    );
  }

  public async getLogs(): Promise<SystemLog[]> {
    return this.execute(
      async () => {
        const snapshot = await this.logsColl.orderBy('timestamp', 'desc').limit(100).get();
        const list: SystemLog[] = [];
        snapshot.forEach(doc => {
          list.push(doc.data() as SystemLog);
        });
        return list;
      },
      async () => {
        const data = readLocalDb();
        return data.logs.slice(0, 100);
      }
    );
  }

  public async addLog(userId: string, action: string, details: string): Promise<void> {
    return this.execute(
      async () => {
        let email = 'SYSTEM';
        if (userId !== 'SYSTEM') {
          const user = await this.getUserById(userId);
          if (user) {
            email = user.email;
          }
        }

        const id = crypto.randomUUID();
        const log: SystemLog = {
          id,
          userId,
          userEmail: email,
          action,
          details,
          timestamp: new Date().toISOString()
        };

        await this.logsColl.doc(id).set(log);
      },
      async () => {
        let email = 'SYSTEM';
        if (userId !== 'SYSTEM') {
          const data = readLocalDb();
          const user = data.users[userId];
          if (user) {
            email = user.email;
          }
        }

        const id = crypto.randomUUID();
        const log: SystemLog = {
          id,
          userId,
          userEmail: email,
          action,
          details,
          timestamp: new Date().toISOString()
        };

        const data = readLocalDb();
        data.logs.unshift(log);
        writeLocalDb(data);
      }
    );
  }

  public async addConsultation(
    userId: string,
    query: string,
    response: string,
    category: string
  ): Promise<Consultation> {
    const id = crypto.randomUUID();
    let email = 'guest@sarthavaha.com';
    if (userId !== 'SYSTEM') {
      const user = await this.getUserById(userId);
      if (user) {
        email = user.email;
      }
    }

    const consultation: Consultation = {
      id,
      userId,
      userEmail: email,
      query,
      response,
      category,
      timestamp: new Date().toISOString()
    };

    return this.execute(
      async () => {
        await this.consultationsColl.doc(id).set(consultation);
        return consultation;
      },
      async () => {
        const data = readLocalDb();
        if (!data.consultations) data.consultations = {};
        data.consultations[id] = consultation;
        writeLocalDb(data);
        return consultation;
      }
    );
  }

  public async getConsultations(userId: string): Promise<Consultation[]> {
    return this.execute(
      async () => {
        const snapshot = await this.consultationsColl
          .where('userId', '==', userId)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        const list: Consultation[] = [];
        snapshot.forEach(doc => {
          list.push(doc.data() as Consultation);
        });
        return list;
      },
      async () => {
        const data = readLocalDb();
        const consultations = data.consultations ? Object.values(data.consultations) : [];
        return consultations
          .filter(c => c.userId === userId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50);
      }
    );
  }

  public async deleteConsultation(userId: string, id: string): Promise<boolean> {
    return this.execute(
      async () => {
        const docRef = this.consultationsColl.doc(id);
        const doc = await docRef.get();
        if (doc.exists && doc.data()?.userId === userId) {
          await docRef.delete();
          return true;
        }
        return false;
      },
      async () => {
        const data = readLocalDb();
        if (data.consultations && data.consultations[id] && data.consultations[id].userId === userId) {
          delete data.consultations[id];
          writeLocalDb(data);
          return true;
        }
        return false;
      }
    );
  }

  public async addVoiceCommand(
    userId: string,
    transcript: string,
    executedAction?: string,
    responseSpoken?: string
  ): Promise<VoiceCommand> {
    const id = crypto.randomUUID();
    let email = 'guest@sarthavaha.com';
    if (userId !== 'SYSTEM') {
      const user = await this.getUserById(userId);
      if (user) {
        email = user.email;
      }
    }

    const command: VoiceCommand = {
      id,
      userId,
      userEmail: email,
      transcript,
      executedAction: executedAction || '',
      responseSpoken: responseSpoken || '',
      timestamp: new Date().toISOString()
    };

    return this.execute(
      async () => {
        await this.voiceCommandsColl.doc(id).set(command);
        return command;
      },
      async () => {
        const data = readLocalDb();
        if (!data.voiceCommands) data.voiceCommands = {};
        data.voiceCommands[id] = command;
        writeLocalDb(data);
        return command;
      }
    );
  }

  public async getVoiceCommands(userId: string): Promise<VoiceCommand[]> {
    return this.execute(
      async () => {
        const snapshot = await this.voiceCommandsColl
          .where('userId', '==', userId)
          .orderBy('timestamp', 'desc')
          .limit(50)
          .get();
        const list: VoiceCommand[] = [];
        snapshot.forEach(doc => {
          list.push(doc.data() as VoiceCommand);
        });
        return list;
      },
      async () => {
        const data = readLocalDb();
        const commands = data.voiceCommands ? Object.values(data.voiceCommands) : [];
        return commands
          .filter(c => c.userId === userId)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50);
      }
    );
  }
}

export const db = new Database();
