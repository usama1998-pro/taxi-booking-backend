-- Driver aggregate ratings (updated by your rating flow later; nullable until first rating).
ALTER TABLE "Driver" ADD COLUMN "ratingAverage" DOUBLE PRECISION;
ALTER TABLE "Driver" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0;
