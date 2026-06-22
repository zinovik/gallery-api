import { Firestore, FieldPath } from '@google-cloud/firestore';
import { Injectable } from '@nestjs/common';

const FIRESTORE_DB = 'gallery-db';
const SLASH = '___';

@Injectable()
export class FirestoreService {
    private readonly firestore: Firestore = new Firestore({
        databaseId: FIRESTORE_DB,
    });

    async getAllFirestoreDocuments<T extends FirebaseFirestore.DocumentData>(
        collectionName: string,
        keyName: string
    ): Promise<T[]> {
        console.time(`FIREBASE: getAllFirestoreDocuments - ${collectionName}`);
        const snapshot = await this.firestore.collection(collectionName).get();
        console.timeEnd(
            `FIREBASE: getAllFirestoreDocuments - ${collectionName}`
        );

        return snapshot.docs.map(
            (doc) =>
                ({
                    ...doc.data(),
                    [keyName]: doc.id.replace(new RegExp(SLASH, 'g'), '/'),
                }) as T
        );
    }

    async getFirestoreDocuments<T extends FirebaseFirestore.DocumentData>(
        collectionName: string,
        documentIds: string[],
        keyName: string
    ): Promise<T[]> {
        const chunks = [];

        for (let i = 0; i < documentIds.length; i += 30) {
            chunks.push(
                documentIds
                    .slice(i, i + 30)
                    .map((documentId) => documentId.replace(/\//g, SLASH))
            );
        }

        console.time(
            `FIREBASE: getFirestoreDocuments - ${collectionName} (${documentIds.length})`
        );
        const snapshots = await Promise.all(
            chunks.map((chunk) =>
                this.firestore
                    .collection(collectionName)
                    .where(FieldPath.documentId(), 'in', chunk)
                    .get()
            )
        );
        console.timeEnd(
            `FIREBASE: getFirestoreDocuments - ${collectionName} (${documentIds.length})`
        );

        return snapshots.flatMap((snapshot) =>
            snapshot.docs.map(
                (doc) =>
                    ({
                        [keyName]: doc.id.replace(new RegExp(SLASH, 'g'), '/'),
                        ...doc.data(),
                    }) as T
            )
        );
    }

    async writeFirestoreDocuments<T extends FirebaseFirestore.DocumentData>(
        collectionName: string,
        documents: T[],
        keyName: string,
        ttlMs?: number
    ): Promise<void> {
        const chunks = [];

        for (let i = 0; i < documents.length; i += 500) {
            chunks.push(documents.slice(i, i + 500));
        }

        for (const chunk of chunks) {
            const batch = this.firestore.batch();

            for (const item of chunk) {
                const { [keyName]: id, ...data } = item;

                batch.set(
                    this.firestore
                        .collection(collectionName)
                        .doc(id.replace(/\//g, SLASH)),
                    {
                        ...data,
                        ...(ttlMs && {
                            expiresAt: new Date(Date.now() + ttlMs),
                        }),
                    }
                );
            }

            await batch.commit();
        }
    }

    async removeAllFirestoreDocuments(collectionName: string): Promise<void> {
        const collectionRef = this.firestore.collection(collectionName);

        while (true) {
            const snapshot = await collectionRef.limit(500).get();

            if (snapshot.empty) {
                break;
            }

            const batch = this.firestore.batch();

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
        }
    }

    async removeFirestoreDocuments(
        collectionName: string,
        documentIds: string[]
    ): Promise<void> {
        const chunks = [];

        for (let i = 0; i < documentIds.length; i += 30) {
            chunks.push(
                documentIds
                    .slice(i, i + 30)
                    .map((documentId) => documentId.replace(/\//g, SLASH))
            );
        }

        const snapshots = await Promise.all(
            chunks.map((chunk) =>
                this.firestore
                    .collection(collectionName)
                    .where(FieldPath.documentId(), 'in', chunk)
                    .get()
            )
        );

        const docs = snapshots.flatMap((snapshot) => snapshot.docs);

        if (docs.length === 0) return;

        for (let i = 0; i < docs.length; i += 500) {
            const batch = this.firestore.batch();

            docs.slice(i, i + 500).forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
        }
    }
}
