ALTER TABLE "WorkoutExercise"
ALTER COLUMN "sets" TYPE TEXT
USING "sets"::TEXT;

ALTER TABLE "WorkoutExercise"
ALTER COLUMN "restSeconds" TYPE TEXT
USING "restSeconds"::TEXT;
